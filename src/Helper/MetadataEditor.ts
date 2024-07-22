import { IField, Template } from "./TM/Types";
import Valo, { MigrationLvL, ValoGroupWithMigrationLvL } from "./Valo/Valo";
import TM from "../Helper/TM/TM";
import { FieldValue } from "./Valo/Types";
import Utils from "./Utils";
import Log from "./Log";
import { Separator } from "inquirer";

type _TM = Awaited<ReturnType<typeof TM>>;

export default class MetadataEditor {
  CreateFields: Parameters<_TM["metadata"]["add"]>[1] = [];
  LinkFields: {
    team: string;
    from: FieldValue;
    to: string;
  }[] = [];

  private allFields: IField[] = [];

  private teamToEdit?: ValoGroupWithMigrationLvL;
  private valoField?: FieldValue;

  private clear = () =>
    Utils.clearWH(
      ...[
        Log.f.underscore(Log.f.underscore("Metadata Editor")),
        ...[
          this.currentLvL === 0
            ? "\n" +
              Log.padLeft(
                Log.colSpace([
                  [
                    Log.f.fg.green("Green"),
                    `-  Metadata types and names match with the template '${this.template.displayName}'`,
                  ],
                  [
                    Log.f.fg.yellow("Yellow"),
                    `-  Metadata types match with the template '${this.template.displayName}'`,
                  ],
                  [
                    Log.f.fg.red("Red"),
                    `-  Metadata types and names don't match with the template '${this.template.displayName}'`,
                  ],
                  [
                    Log.f.fg.blue("Blue"),
                    `-  There are no metadata fields on the Valo Team  |  If the Team is selected for migration the metadata values will be empty`,
                  ],
                ]),
                2
              ) +
              "\n"
            : "",
        ],
        ...(this.teamToEdit
          ? [`\nSelected team:  \t'${this.teamToEdit.title}'`]
          : []),
        ...(this.valoField
          ? [`Selected valo field:  \t'${this.valoField.fieldName}'`]
          : []),
        "",
      ]
    );

  private currentLvL = 0;
  private next = (factor: number = 1) => (this.currentLvL += factor);
  private prev = (factor: number = 1) => (this.currentLvL -= factor);
  private goto = (lvl: number) => (this.currentLvL = lvl);

  constructor(
    private tm: _TM,
    private valoTeams: ValoGroupWithMigrationLvL[],
    private template: Template
  ) {
    valoTeams
      .filter((x) => x.migrationLvl === MigrationLvL.FullMatch)
      .forEach(
        (team) =>
          team.dynamicMetadata?.fieldValues &&
          Valo.mapMetadataTypesToTM(team.dynamicMetadata.fieldValues).forEach(
            (field) =>
              this.LinkFields.push({
                team: team.id,
                from: field,
                to: field.fieldName,
              })
          )
      );
  }

  private selectTeam = async () => {
    this.teamToEdit = undefined;
    this.clear();
    const selection = await Utils.prmpt(
      "Choose team for which to change the fields",
      [
        { name: Log.f.dim("Go to migration overview"), value: null },
        new Separator(),
        ...Valo.injectMigrationLvL(
          this.template,
          this.valoTeams,
          this.LinkFields.map((x) => ({ teamId: x.team, field: x.from }))
        ).map((item) => ({
          name: [Log.f.fg.red, Log.f.fg.yellow, Log.f.fg.green, Log.f.fg.blue][
            item.migrationLvl
          ](item.title),
          value: item,
        })),
      ]
    );
    if (selection === null) return this.prev();
    this.teamToEdit = selection;
    this.next();
  };

  private selectAction = async () => {
    this.clear();
    if (!this.teamToEdit) return this.prev();
    const teamWithNewLvL = Valo.injectMigrationLvL(
      this.template,
      [this.teamToEdit],
      this.LinkFields.map((x) => ({ teamId: x.team, field: x.from }))
    )[0];
    const selection = !this.LinkFields.find(
      (x) => x.team === this.teamToEdit?.id
    )
      ? true
      : teamWithNewLvL.migrationLvl === MigrationLvL.FullMatch
      ? false
      : await Utils.prmpt("Choose action", [
          { name: Log.f.dim("Go to migration overview"), value: null },
          new Separator(),
          {
            name: "Map",
            value: true,
          },
          {
            name: "Unmap",
            value: false,
          },
        ]);
    selection === null ? this.prev() : selection ? this.next() : this.goto(6);
  };

  private autoMigrateCheck = async () => {
    if (!this.teamToEdit) return this.prev(2);
    this.clear();
    if (this.teamToEdit.migrationLvl === MigrationLvL.TypeMatch) {
      console.log(
        [
          "The script can auto migrate the metadata based on the types",
          "You will still be able to edit the metadata fields later on",
          `\nThe automatic migration would result in following migration for '${this.teamToEdit.title}':\n\n`,
        ].join("\n")
      );

      var autoMigrateMap: (typeof this)["LinkFields"] = [];
      if (
        this.teamToEdit.dynamicMetadata &&
        this.teamToEdit.dynamicMetadata.fieldValues
      ) {
        var valoFieldTypes: FieldValue[] = Valo.mapMetadataTypesToTM(
            this.teamToEdit.dynamicMetadata.fieldValues
          ),
          _valoFieldTypes = [...valoFieldTypes],
          templateFieldTypes = [...this.template.fields];
        templateFieldTypes.forEach((x) => {
          var foundIndex = _valoFieldTypes.findIndex(
            (y) => y.fieldType === x.type && y.fieldName === x.title
          );
          foundIndex === -1 &&
            (foundIndex = _valoFieldTypes.findIndex(
              (y) => y.fieldType === x.type
            ));
          const found = _valoFieldTypes[foundIndex];
          if (foundIndex === -1) return;
          _valoFieldTypes.splice(foundIndex, 1);
          autoMigrateMap.push({
            team: (this.teamToEdit as any).id,
            from: found,
            to: x.title,
          });
        });
      }
      console.log(
        Log.padLeft(
          Log.colSpace(
            autoMigrateMap.map((x) => [
              x.from.fieldName,
              Log.f.dim("-->"),
              x.to,
            ]),
            4
          ),
          4
        ),
        "\n\n"
      );
      const autoMigrate = await Utils.prmpt("Do you want to Auto-Migrate?", [
        { name: Log.f.dim("Go back"), value: null },
        new Separator(),
        { name: "Auto-Migrate based on type", value: true },
        { name: "Manually migrate", value: false },
      ]);
      autoMigrate === true && this.LinkFields.push(...autoMigrateMap);
      if (autoMigrate !== false) return this.prev(2);
    }
    this.next();
  };

  private selectValoField = async () => {
    this.valoField = undefined;
    this.clear();
    if (!this.teamToEdit) return this.goto(0);
    const selection = await Utils.prmpt("Choose a Valo Metadata field", [
      { name: Log.f.dim("Go back"), value: null },
      new Separator(),
      ...Valo.mapMetadataTypesToTM(
        this.teamToEdit.dynamicMetadata?.fieldValues || []
      )
        .filter(
          (x) =>
            !this.LinkFields.filter((x) => x.team === this.teamToEdit?.id).find(
              (y) =>
                Object.entries(y.from).every(([k, v]) => v === (x as any)[k])
            )
        )
        .map((x) => ({
          name: x.fieldName,
          value: x,
        })),
    ]);
    if (selection === null) return this.goto(0);
    this.valoField = selection;
    this.next();
  };

  private selectTMField = async () => {
    this.clear();
    const selection = await Utils.prmpt(
      `Choose TM Metadata field to migrate '${this.valoField?.fieldName}' to`,
      [
        { name: Log.f.dim("Go back"), value: null },
        new Separator(),
        {
          name: Log.f.fg.green("Create new metadata field"),
          value: 1,
        },
        ...this.CreateFields.filter(
          (x) =>
            !this.LinkFields.find(
              (y) => y.to === x.title && y.team === this.teamToEdit?.id
            )
        ).map((x) => ({
          name: x.title,
          value: {
            title: x.title,
          },
        })),
        ...this.template.fields.filter(
          (x) =>
            !this.LinkFields.filter((x) => x.team === this.teamToEdit?.id).find(
              (y) => y.to === x.title
            ) && x.type === this.valoField?.fieldType
        ).map((x) => ({
          name: x.title,
          value: x,
        })),
      ]
    );
    if (selection === null) return this.prev();
    if (typeof selection === "number") return this.next();
    this.LinkFields.push({
      team: (this.teamToEdit as any).id,
      from: this.valoField as any,
      to: selection.title,
    });
    this.goto(3);
  };

  private createTMField = async () => {
    this.clear();
    const useName =
      this.allFields.find((x) => x.title === this.valoField?.fieldName) ||
      this.CreateFields.find((x) => x.title === this.valoField?.fieldName)
        ? false
        : await Utils.prmpt(
            `Do you want to use '${this.valoField?.fieldName}' for the name?`,
            [
              { name: Log.f.dim("Go back"), value: null },
              new Separator(),
              { name: "Use it", value: true },
              { name: "Enter custom name", value: false },
            ]
          );
    if (useName === null) return this.prev();
    var title = this.valoField?.fieldName as any;
    if (!useName) {
      var changeName: boolean | null = null;
      do {
        title = await Utils.input("Enter custom name for the field:", (i) =>
          !i.trim()
            ? "Name cannot be empty"
            : this.allFields.find((x) => x.title === i) ||
              this.CreateFields.find((x) => x.title === i)
            ? "Name already exists"
            : true
        );
      } while (
        (changeName = await Utils.prmpt("Do you want to change the name?", [
          { name: Log.f.dim("Discard go back"), value: null },
          new Separator(),
          { name: "Yes change name", value: true },
          { name: "No continue and save name", value: false },
        ]))
      );
      if (changeName === null) return this.prev();
    }
    this.CreateFields.push({
      title,
      type: this.valoField?.fieldType as any,
    });
    this.LinkFields.push({
      team: (this.teamToEdit as any).id,
      from: this.valoField as any,
      to: title,
    });
    this.goto(3);
  };

  private selectToUnmap = async () => {
    this.clear();
    const selection = await Utils.prmpt("Choose a TM Metadata field to unmap", [
      { name: Log.f.dim("Go back"), value: null },
      new Separator(),
      ...this.LinkFields.filter((x) => x.team === this.teamToEdit?.id).map(
        (x, i) => ({
          name: x.to,
          value: x,
        })
      ),
    ]);
    if (selection !== null) {
      if (
        this.CreateFields.find((x) => x.title === selection.to) &&
        this.LinkFields.filter((x) => x.to === selection.to).length === 1
      ) {
        console.log(
          "\n  The field you selected is a field that would be created but is only being used 1 time\n  so unmapping it would result in deletion from the list (not the TM)"
        );
        const deleteFieldPrompt = await Utils.prmpt("Do you want to unmap it", [
          {
            name: "Yes, unmap and delete",
            value: true,
          },
          {
            name: "No, go back",
            value: false,
          },
        ]);
        if (deleteFieldPrompt)
          this.CreateFields.splice(
            this.CreateFields.findIndex((x) => x.title === selection.to),
            1
          );
        else return;
      }
      return this.LinkFields.splice(
        this.LinkFields.findIndex((x) => x === selection),
        1
      );
    }
    const teamWithNewLvL = Valo.injectMigrationLvL(
      this.template,
      [this.teamToEdit as any],
      this.LinkFields.map((x) => ({ teamId: x.team, field: x.from }))
    )[0];
    return this.goto(
      teamWithNewLvL.migrationLvl === MigrationLvL.FullMatch ? 0 : 1
    );
  };
//   pppppppppppppppp
  private lvlMap = [
    this.selectTeam,
    this.selectAction,
    this.autoMigrateCheck,
    this.selectValoField,
    this.selectTMField,
    this.createTMField,
    this.selectToUnmap,
  ];
  // pppppppppppppppppp

  run = async () => {
    Utils.clearWH("Loading data...");
    this.allFields = await this.tm.metadata.fields.get.all();
    do {
      this.currentLvL = 0;
      var fx = this.lvlMap[this.currentLvL];
      this.clear();
      while (true) {
        await fx();
        this.currentLvL >= this.lvlMap.length && (this.currentLvL = 0);
        if (this.currentLvL < 0) break;
        fx = this.lvlMap[this.currentLvL];
      }
      Utils.clearWH();
      console.log(
        [
          "",
          "Migration Overview",
          Log.f.dim(
            `- ${Log.f.underscore(
              "Underlined fields"
            )} will be created while migrating\n`,
            "- Field names longer than 100 characters will be truncated\n",
            "- Field names will be mapped according to the name since the name must be globally unique\n",
            "- If you don't see a team you want to migrate it means\n  that the team has no metadata fields or is missing some mapping (not green)"
          ),
          "",
        ].join("\n")
      );
      Valo.injectMigrationLvL(
        this.template,
        this.valoTeams,
        this.LinkFields.map((x) => ({ teamId: x.team, field: x.from }))
      )
        .filter((x) => x.migrationLvl === MigrationLvL.FullMatch)
        .forEach((team) => {
          console.log("\nTeam:      " + team.title);
          console.log("Metadata:  ");
          const fieldsForCurrentTeam = this.LinkFields.filter(
            (x) => x.team === team.id
          );
          console.log(
            Log.padLeft(
              Log.colSpace(
                Valo.mapMetadataTypesToTM(
                  team.dynamicMetadata?.fieldValues || []
                ).map((field, i, arr) => {
                  const migratedField = fieldsForCurrentTeam.find(
                    (x) =>
                      x.from.fieldName === field.fieldName &&
                      x.from.fieldType === field.fieldType
                  );
                  const createField = this.CreateFields.find(
                    (x) => x.title === field.fieldName
                  );
                  return [
                    Log.f.dim(`${i === arr.length - 1 ? "┗" : "┣"}━`),
                    field.fieldName.slice(0, 100),
                    ...(migratedField
                      ? [
                          Log.f.dim("-->"),
                          createField
                            ? Log.f.underscore(migratedField.to.slice(0, 100))
                            : migratedField.to.slice(0, 100),
                        ]
                      : []),
                  ];
                })
              )
            ),
            "\n"
          );
        });
    } while (
      await Utils.prmpt("Do you want to edit something?", [
        {
          name: "Yes edit something",
          value: true,
        },
        {
          name: "No start migration",
          value: false,
        },
      ])
    );
  };
}
