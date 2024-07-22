import { IField, Template } from "../TM/Types";
import { FieldValue, ValoGroup } from "./Types";

export enum MigrationLvL {
  NoMatch,
  TypeMatch,
  FullMatch,
  NoValues,
}

export type ValoGroupWithMigrationLvL = ValoGroup & {
  migrationLvl: MigrationLvL;
};

class Valo {
  static instance = new Valo();
  private constructor() {}

  mapMetadataTypesToTM = (fieldValues: FieldValue[]): FieldValue[] => {
    const typeMap: { [key: string]: string } = {
      User: "person",
      DateTime: "date",
      Choice: "dropdown",
      Text: "text",
      person: "person",
      date: "date",
      dropdown: "dropdown",
      text: "text",
    };
    return fieldValues
      .map((field) => ({
        ...field,
        fieldType: typeMap[field.fieldType],
      }))
      .filter((field) => field.fieldType !== undefined);
  };

  private getMigrationLvL = (
    templateFields: IField[],
    group: ValoGroup,
    migratedFields: FieldValue[] = []
  ): MigrationLvL => {
    if (!group.dynamicMetadata || !group.dynamicMetadata.fieldValues.length)
      return MigrationLvL.NoValues;

    var valoFieldTypes: FieldValue[] = this.mapMetadataTypesToTM(
      group.dynamicMetadata.fieldValues
    );

    if (
      !valoFieldTypes.filter(
        (field) =>
          !migratedFields.find((mField) =>
            Object.entries(mField).every(([k, v]) => v === (field as any)[k])
          )
      ).length
    )
      return MigrationLvL.FullMatch;

    var used: any[] = [];
    if (
      valoFieldTypes.every((vField) => {
        var found = templateFields
          .filter((x) => !used.includes(x))
          .find((tField) => tField.type === vField.fieldType);
        used.push(found);
        return found;
      })
    ) {
      used = [];
      if (
        valoFieldTypes.every((vField) => {
          var found = templateFields
            .filter((x) => !used.includes(x))
            .find(
              (tField) =>
                tField.type === vField.fieldType &&
                tField.title === vField.fieldName
            );
          used.push(found);
          return found;
        })
      )
        return MigrationLvL.FullMatch;
      return MigrationLvL.TypeMatch;
    }
    return MigrationLvL.NoMatch;
  };

  injectMigrationLvL = (
    template: Template,
    groups: ValoGroup[],
    migratedFields: { teamId: string; field: FieldValue }[] = []
  ): ValoGroupWithMigrationLvL[] =>
    groups.map((group) => ({
      ...group,
      migrationLvl: this.getMigrationLvL(
        template.fields,
        group,
        this.mapMetadataTypesToTM(
          migratedFields
            .filter((field) => field.teamId === group.id)
            .map((x) => x.field)
        )
      ),
    }));
}

export default Valo.instance;
