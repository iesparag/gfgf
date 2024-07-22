import TM from "./Helper/TM/TM";
import path from "path";
import Utils from "./Helper/Utils";
import Log from "./Helper/Log";
import statics from "./statics";
import PS from "./Helper/PS";
import inquirer from "inquirer";
import { IField, IFieldValue, Template } from "./Helper/TM/Types";
import { FieldValue, ValoGroup } from "./Helper/Valo/Types";
import Valo, {
  MigrationLvL,
  ValoGroupWithMigrationLvL,
} from "./Helper/Valo/Valo";
import MetadataEditor from "./Helper/MetadataEditor";
import fs from "fs";

Log.clear();

!Utils.isAdmin && Log.crash("Script needs to be run as Admin");

(async () => {
  if (!fs.existsSync("auth.json")) {
    Log.info("Tip: You can press 'Ctrl + C' to stop the script at any time\n");
    Utils.sleep(5000);
  }
  const tm = await TM("teamsmanagerprod.azurefd.net");
  Log.clear();

  Utils.clearWH();
  Log.info("Fetching TM infos (might take a while)...");
  var managedTeams = await tm.team.managed.get.all(),
    templates = await tm.template.get.all();

  Log.info("Choose json file...");
  const file = await PS.selectFileDialog({
    fileTypes: {
      JSON: "*.json",
    },
    forceSelect: true,
  });

  var data = await Utils.task(
    "reading json file",
    async () => (await Utils.fs.readJSON(file, false)) as ValoGroup[]
  );

  if (
    !Array.isArray(data) ||
    data.some((x) => typeof x.id !== "string" || typeof x.title !== "string")
  )
    return Log.crash("Invalid json file");

  data = data.filter((x: any) => !managedTeams.find((y) => y.TeamId === x.id));
  Utils.clearWH();

  if (!data.length) return Log.crash("No teams to migrate found");

  var template = await Utils.prmpt(
    "Choose which template to use for migration",
    templates.filter((x)=>x.displayName.length>0).map((x) => ({ name: x.displayName, value: x }))
  );

  Utils.clearWH();
  console.log(
    Log.padLeft(
      Log.colSpace([
        [
          Log.f.fg.green("Green"),
          `-  Metadata types and names match with the template '${template.displayName}'`,
        ],
        [
          Log.f.fg.yellow("Yellow"),
          `-  Metadata types match with the template '${template.displayName}'`,
        ],
        [
          Log.f.fg.red("Red"),
          `-  Metadata types and names don't match with the template '${template.displayName}'`,
        ],
        [
          Log.f.fg.blue("Blue"),
          `-  There are no metadata fields on the Valo Team  |  If the Team is selected for migration the metadata values will be empty`,
        ],
      ]),
      2
    ),
    "\n"
  );

  var valoTeams = await Utils.prmpt(
    `Choose which team to migrate with the template '${template.displayName}'`,
    Valo.injectMigrationLvL(template, data).map((item) => ({
      name: [Log.f.fg.red, Log.f.fg.yellow, Log.f.fg.green, Log.f.fg.blue][
        item.migrationLvl
      ](item.title),
      value: item,
    })),
    { selectMulti: true }
  );
  const editor = new MetadataEditor(tm, valoTeams, template);
  await editor.run();

  console.log("\n");

  Log.info("Migrating...");

  if (editor.CreateFields.length)
    await Utils.task("creating metadata fields", () =>
      tm.metadata.add(template.id, editor.CreateFields)
    );

  var allFieldValues = await tm.metadata.fields.get.all();

  fs.writeFileSync("fields.json", JSON.stringify(editor.LinkFields, null, 2));

  await Promise.all(
    Valo.injectMigrationLvL(
      template,
      valoTeams,
      editor.LinkFields.map((x) => ({ teamId: x.team, field: x.from }))
    )
      .filter((x) => x.migrationLvl === MigrationLvL.FullMatch)
      .map(async (valo) => {
        Log.info(`Migrating '${valo.title}'...`);
        await tm.team.convertToManaged(
          template.id,
          valo.id,
          valo.title,
          await Promise.all(
            Valo.mapMetadataTypesToTM(
              valo.dynamicMetadata?.fieldValues || []
            ).map(async (field) => {
              const linkField = editor.LinkFields.find(
                (x) =>
                  x.team === valo.id &&
                  x.from.fieldName === field.fieldName &&
                  x.from.fieldType === field.fieldType
              );
              var fieldId = linkField
                ? allFieldValues.find((x) => x.title === linkField?.to)?.id
                : allFieldValues.find((x) => x.title === field.fieldName)?.id;
              if (fieldId === undefined) {
                Log.warn(`Couldn't find fieldId for '${field.fieldName}'`);
                return undefined as any;
              }
              const res = { fieldId, value: (field.values || [""])[0] };
              if (field.fieldType === "person" && res.value) {
                res.value = JSON.stringify(
                  (
                    await Promise.all(
                      (field.values || []).map(async (upn) => {
                        const user = (await tm.user.get.allBySearch(upn))[0];
                        return user
                          ? {
                              id: user.id,
                              loginName: user.userPrincipalName,
                              secondaryText: user.userPrincipalName,
                              primaryText: user.displayName,
                            }
                          : undefined;
                      })
                    )
                  ).filter((x) => x !== undefined)
                );
              }
              return res;
            })
          ).then((x) => x.filter((x) => x !== undefined))
        );
        Log.info(`Sucessfully migrated '${valo.title}'`);
      })
  );
  Log.info("Done");
})();

// var fieldsMigrationMap: ({
//   team: string;
// } & (
//   | {
//       action: "create";
//       infos: {
//         from: FieldValue;
//         to?: Omit<IField, "Id" | "required">;
//       };
//     }
//   | {
//       action: "migrate";
//       infos: {
//         from: FieldValue;
//         to: IField;
//       };
//     }
// ))[] = [];
// while (
//   Valo.injectMigrationLvL(
//     template,
//     valoTeams,
//     fieldsMigrationMap.map((x) => ({ teamId: x.team, field: x.infos.from }))
//   ).some((x) => x.migrationLvl !== MigrationLvL.FullMatch)
// ) {
//   let clearMetadataFix = () => {
//     Utils.clearWH();
//     console.log("Some metadata fields need to be fixed to allow migration\n");
//   };
//   clearMetadataFix();

//   const teamToFix = await Utils.prmpt(
//     "Choose team for which to change the fields",
//     Valo.injectMigrationLvL(
//       template,
//       valoTeams,
//       fieldsMigrationMap.map((x) => ({ teamId: x.team, field: x.infos.from }))
//     )
//       .filter((x) => x.migrationLvl !== MigrationLvL.FullMatch)
//       .map((item) => ({
//         name: [Log.f.fg.red, Log.f.fg.yellow, Log.f.fg.green, Log.f.fg.blue][
//           item.migrationLvl
//         ](item.title),
//         value: item,
//       }))
//   );

//   clearMetadataFix();

//   if (
//     !teamToFix.dynamicMetadata ||
//     !teamToFix.dynamicMetadata.fieldValues.length
//   ) {
//     console.log(`No metadata found for '${teamToFix.title}'`);
//     await Utils.sleep(3000);
//     continue;
//   }

//   const fieldsForCurrentTeam = fieldsMigrationMap.filter(
//       (x) => x.team === teamToFix.id
//     ),
//     valoMetadata = await Utils.prmpt(
//       "Choose a Valo Metadata field",
//       Valo.mapMetadataTypesToTM(teamToFix.dynamicMetadata?.fieldValues || [])
//         .filter(
//           (x) =>
//             !fieldsForCurrentTeam.find((y) =>
//               Object.entries(y.infos.from).every(
//                 ([k, v]) => v === (x as any)[k]
//               )
//             )
//         )
//         .map((x) => ({
//           name: x.fieldName,
//           value: x,
//         }))
//     ),
//     tmMetadata = await Utils.prmpt(
//       `Choose TM Metadata field to migrate '${valoMetadata.fieldName}' to`,
//       [
//         {
//           name: "Create new metadata field",
//           value: 1,
//         },
//         new inquirer.Separator(),
//         ...fieldsMigrationMap
//           .filter((x) => x.action === "create")
//           .map((x) => ({
//             name: x.infos.to ? x.infos.to.Title : x.infos.from.fieldName,
//             value: {
//               Title: x.infos.to ? x.infos.to.Title : x.infos.from.fieldName,
//               Type: x.infos.from.fieldType,
//             } as IField,
//           })),
//         ...template.fields.filter(
//           (x) =>
//             !fieldsForCurrentTeam.find(
//               (y) => y.action === "migrate" && y.infos.to === x
//             ) && x.Type === valoMetadata.fieldType
//         ).map((x) => ({
//           name: x.Title,
//           value: x,
//         })),
//       ]
//     );

//   if (typeof tmMetadata === "number") {
//     if (!allFieldValues.find((x) => x.Title === valoMetadata.fieldName))
//       fieldsMigrationMap.push({
//         team: teamToFix.id,
//         action: "create",
//         infos: { from: valoMetadata },
//       });
//     const newName = await Utils.input(
//       `Enter new name for the field '${valoMetadata.fieldName}'`,
//       (name) =>
//         !name.trim().length
//           ? "Field name can't be empty"
//           : name.trim().length > 100
//           ? "Field name can't be longer than 100 characters"
//           : allFieldValues.find((x) => x.Title === name) ||
//             fieldsMigrationMap.find((x) =>
//               x.action === "create"
//                 ? x.infos.from.fieldName === name
//                 : x.infos.to.Title === name
//             )
//           ? "Field name already exists"
//           : true
//     ).then((x) => x.trim());
//     fieldsMigrationMap.push({
//       team: teamToFix.id,
//       action: "create",
//       infos: {
//         from: valoMetadata,
//         to: {
//           Title: newName,
//           Type: valoMetadata.fieldType as any,
//         },
//       },
//     });
//     continue;
//   }

//   fieldsMigrationMap.push({
//     team: teamToFix.id,
//     action: "migrate",
//     infos: {
//       from: valoMetadata,
//       to: tmMetadata,
//     },
//   });
// }

// allFieldValues = await tm.metadata.fields.get.all();
// do {
//   Utils.clearWH();
//   console.log(
//     [
//       "",
//       "Migration Overview",
//       Log.f.dim(
//         `- ${Log.f.underscore(
//           "Underlined fields"
//         )} will be created while migrating\n`,
//         "- Field names longer than 100 characters will be truncated\n",
//         "- Field names will be mapped according to the name since the name must be globally unique"
//       ),
//       "",
//     ].join("\n")
//   );
//   valoTeams.forEach((team) => {
//     console.log("\nTeam:      " + team.title);
//     console.log("Metadata:  ");
//     const fieldsForCurrentTeam = fieldsMigrationMap.filter(
//       (x) => x.team === team.id
//     );
//     console.log(
//       Log.padLeft(
//         Log.colSpace(
//           Valo.mapMetadataTypesToTM(
//             team.dynamicMetadata?.fieldValues || []
//           ).map((field, i, arr) => {
//             const migratedField = fieldsForCurrentTeam.find((x) =>
//               Object.entries(x.infos.from).every(
//                 ([k, v]) => v === (field as any)[k]
//               )
//             );
//             return [
//               Log.f.dim(`${i === arr.length - 1 ? "┗" : "┣"}━`),
//               field.fieldName.slice(0, 100),
//               ...(migratedField
//                 ? [
//                     Log.f.dim("-->"),
//                     migratedField.action === "create"
//                       ? Log.f.underscore(
//                           migratedField.infos.from.fieldName.slice(0, 100)
//                         )
//                       : migratedField.infos.to.Title.slice(0, 100),
//                   ]
//                 : []),
//             ];
//           })
//         )
//       ),
//       "\n"
//     );
//   });

//   const action = await Utils.prmpt("Choose a option", [
//     { name: "Change something", value: 1 },
//     { name: "Start migration", value: 0 },
//   ]);

//   if (!action) break;

//   do {
//     Utils.clearWH();

//     const options = await Utils.prmpt(
//       "Choose a option",
//       ["Change metadata", "Start migration"].map((x, i) => ({
//         name: x,
//         value: i,
//       }))
//     );

//     if (options === 1) break;
//     Utils.clearWH();

//     const teamToFix = await Utils.prmpt(
//       "Choose team for which to change the fields",
//       valoTeams.map((item) => ({
//         name:
//           ["\x1b[31m", "\x1b[33m", "\x1b[32m"][item.migrationLvl] +
//           item.title +
//           "\x1b[0m",
//         value: item,
//       }))
//     );
//     Utils.clearWH();

//     if (
//       !teamToFix.dynamicMetadata ||
//       !teamToFix.dynamicMetadata.fieldValues.length
//     ) {
//       console.log(`No metadata found for '${teamToFix.title}'`);
//       await Utils.sleep(2000);
//       continue;
//     }
//     await (async () => {
//       const valoMetadata = await Utils.prmpt("Choose Valo Metadata field", [
//         {
//           name: "Cancel",
//           value: 1,
//         },
//         new inquirer.Separator(),
//         ...Valo.mapMetadataTypesToTM(
//           teamToFix.dynamicMetadata?.fieldValues || []
//         ).map((x) => ({
//           name: x.fieldName,
//           value: x,
//         })),
//       ]);

//       if (typeof valoMetadata === "number") return;

//       const tmMetadata = await Utils.prmpt(
//         `Choose TM Metadata field to migrate '${valoMetadata.fieldName}' to`,
//         [
//           {
//             name: "Cancel",
//             value: 1,
//           },
//           {
//             name: "Create new metadata field",
//             value: 2,
//           },
//           new inquirer.Separator(),
//           ...template.fields.map((x) => ({
//             name: x.Title,
//             value: x,
//           })),
//         ]
//       );

//       if (typeof tmMetadata === "number") {
//         if (tmMetadata === 1) return;
//         if (!allFieldValues.find((x) => x.Title === valoMetadata.fieldName))
//           fieldsMigrationMap.push({
//             team: teamToFix.id,
//             action: "create",
//             infos: { from: valoMetadata },
//           });
//         const newName = await Utils.input(
//           `Enter new name for the field '${valoMetadata.fieldName}'`,
//           (name) =>
//             !name.trim().length
//               ? "Field name can't be empty"
//               : name.trim().length > 100
//               ? "Field name can't be longer than 100 characters"
//               : allFieldValues.find((x) => x.Title === name) ||
//                 fieldsMigrationMap.find((x) =>
//                   x.action === "create"
//                     ? x.infos.from.fieldName === name
//                     : x.infos.to.Title === name
//                 )
//               ? "Field name already exists"
//               : true
//         ).then((x) => x.trim());
//         return fieldsMigrationMap.push({
//           team: teamToFix.id,
//           action: "create",
//           infos: {
//             from: valoMetadata,
//             to: {
//               Title: newName,
//               Type: valoMetadata.fieldType as any,
//             },
//           },
//         });
//       }

//       fieldsMigrationMap.push({
//         team: teamToFix.id,
//         action: "migrate",
//         infos: {
//           from: valoMetadata,
//           to: tmMetadata,
//         },
//       });
//     })();
//   } while (true);
// } while (true);
