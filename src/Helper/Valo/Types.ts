export interface ValoGroup {
  siteUrl: string;
  picture: string;
  membersStr: string;
  members: Member[];
  totalMembers: number;
  ownersStr: string;
  totalOwners: number;
  owners: Owner[];
  unseenCount: string;
  enableDiscoverySettings: string;
  defaultapp: string;
  filterstringkey1: string;
  filterstringvalue1: string;
  useapp1: string;
  useapp2: string;
  useapp2opturl: string;
  useapp3: string;
  useapp4: string;
  useapp5: string;
  useapp5opturl: string;
  useapp6: string;
  useapp7: string;
  useapp8: string;
  useapp9: string;
  linkkey1: string;
  linkvalue1: string;
  linkkey2: string;
  linkvalue2: string;
  linkkey3: string;
  linkvalue3: string;
  linkkey4: string;
  linkvalue4: string;
  linkkey5: string;
  linkvalue5: string;
  favourite: boolean;
  state?: string;
  archivingDate?: string;
  lifecyclePolicy?: LifecyclePolicy;
  templateName: string;
  id: string;
  title: string;
  titleLowerCase: string;
  description: string;
  allowExternalSharing: string;
  classification: string;
  visibility: string;
  createdDateTime: string;
  partitionKey: string;
  groupActivity: GroupActivity;
  _rid: string;
  _self: string;
  _etag: string;
  _attachments: string;
  _ts: number;
  templateNameLowerCase?: string;
  dynamicMetadata?: DynamicMetadata;
}

export interface Member {
  key: string;
  imageInitials: string;
  text: string;
  hasImage: boolean;
  imageAlt: string;
  personaName: string;
  membershipType: number;
  msGraphUserId: string;
}

export interface Owner {
  key: string;
  imageInitials: string;
  text: string;
  hasImage: boolean;
  imageAlt: string;
  personaName: string;
  membershipType: number;
  msGraphUserId: string;
}

export interface LifecyclePolicy {
  daysExtended: any;
  title?: string;
  description: any;
  listItemId: number;
  policyType?: PolicyType;
}

export interface PolicyType {
  text: string;
  key: string;
}

export interface GroupActivity {
  groupId: string;
  reportRefreshDate: any;
  isDeleted: boolean;
  lastActivityDate: any;
  memberCount: any;
  externalMemberCount: any;
  reportPeriod: any;
  daysInactive: any;
}

export interface DynamicMetadata {
  ctId: string;
  updatedBy?: string;
  fieldValues: FieldValue[];
}

export interface FieldValue {
  fieldName: string;
  fieldType: string;
  values?: string[];
}
