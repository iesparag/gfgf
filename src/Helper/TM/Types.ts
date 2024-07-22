export interface Template {
  savedAt: string;
  createStatus: string;
  fields: IField[];
  isMicrosoftTemplate: boolean;
  dynamicGroups: any;
  spContentTypeId: any;
  id: string;
  packageVersion: number;
  activeTeams: number;
  templateType: number;
  teamId: string;
  teamUrl: string;
  sharePointUrl: any;
  iconUrl: any;
  displayName: string;
  mailNickname: string;
  description: string;
  visibility: string;
  createdAt: string;
  isArchived: boolean;
}

export interface NextLink<T> {
  item1: string | null;
  item2: T;
}

export interface SlimTeam {
  GroupType: number;
  IsFavorite: boolean;
  TeamId: string;
  TeamUrl: string;
  DisplayName: string;
  MailNickname: string;
  Description: string;
  Visibility: string;
  CreatedAt: string;
}

export interface IFieldValue {
  value: string;
  fieldId: number;
}

export interface IField {
  required: boolean;
  order?: number;
  title: string;
  type: "text" | "date" | "person" | "number" | "dropdown" | "checkbox";
  id: number;
  fieldOptions?: FieldOptions;
  defaultValue?: string;
  description?: string;
  spInternalName?: string;
  editableBy?: EditableBy;
}

export interface FieldOptions {
  choices?: FieldChoice[];
  isRunning?: boolean;
  isPermissionField?: boolean;
  permissionGroupName?: string;
}

export enum EditableBy {
  All,
  Admins,
  TeamOwners,
}

export interface FieldChoice {
  internalName: string;
  displayName: string;
}

export interface User {
  businessPhones: any[];
  displayName: string;
  mail: string;
  userPrincipalName: string;
  id: string;
  "@odata.type": string;
}
