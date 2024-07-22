import Auth from "../Auth";
import Log from "../Log";
import Utils from "../Utils";
import fs from "fs/promises";
import {
  IField,
  IFieldValue,
  NextLink,
  SlimTeam,
  Template,
  User,
} from "./Types";
const { decodeJWT, yesno } = Utils;

class _TM {
  constructor(
    private baseUrl: string,
    private auth: Awaited<ReturnType<typeof Auth>>
  ) {}

  private req = async (
    path: string,
    method: "POST" | "PATCH" | "GET" | "PUT" = "POST",
    body: any = {},
    aTValues: { [key: string]: string } = {}
  ): Promise<false | any> => {
    const accessToken = await this.auth.getAccessToken();
    const decodedAt = decodeJWT(accessToken);
    const url = `https://${this.baseUrl}/api${path}`;
    
    const headers: { [key: string]: string } = {
      "Content-Type": "application/json",
      'Authorization': 'Bearer ' + accessToken,
      Origin: this.baseUrl,
    };
  
    if (!this.baseUrl.endsWith("azurefd.net")) {
      headers.TMSource = "true";
    }
  
    const requestBody = method !== "GET" ? JSON.stringify({
      AccessToken: accessToken,
      TenantId: decodedAt.tid,
      ...Object.fromEntries(
        Object.entries(aTValues)
          .map(([k, v]) => [k, decodedAt[v]])
          .filter(([_, v]) => v !== undefined)
      ),
      ...body,
    }) : null;
  
    // console.log(url);
    // console.log(headers);
    // console.log(JSON.stringify(requestBody, null, 2));
    const rsp = await fetch(url, {
      method,
      headers,
      body: requestBody,
    });
  
    if (!rsp.ok) {
      const errorText = await rsp.text();
      Log.warn(`Request to ${path} failed with code ${rsp.status} and following error: ${errorText}`);
  
      if (rsp.status !== 401) {
        Log.crash("Exiting because of failed request...");
      }
  
      Log.warn("This error could be fixed by reauthenticating.");
      if (await yesno("Reauthenticate?")) {
        Log.warn("Trying to fix the problem by reauthenticating...");
        await this.auth.rerunAuth();
        return this.req(path, method, body, aTValues);
      }
  
      Log.crash("Exiting because of failed request...");
    }
  
    try {
      return await rsp.json();
    } catch {
      return false;
    }
  };
  

  private nextIterator = async <T>(
    
      path: string,
      method: "POST" | "PATCH" | "GET" = "POST",
      body?: any,
      aTValues?: {
        [key: string]: string;
      }
    
  ): Promise<T[]> => {
    var collector: T[] = [],
      rsp: NextLink<typeof collector> = { item1: "", item2: [] };
    do {
      rsp = await this.req(
        path,
        method,
        {
          ...(body|| ({} as any)),
          nextLinkString: rsp.item1 || undefined,
        },
        aTValues
      );
      collector.push(...rsp.item2);
    } while (rsp.item1 && rsp.item1 !== "" && rsp.item1 !== "1");
    return collector;
  };

  template = {
    get: {
      all: (): Promise<Template[]> =>
        this.req("/GetTemplates","GET").then((templates) =>
          templates.filter(
            (x: any) =>
              !["groupTemplate.default", "yammerTemplate.default"].includes(
                x.TeamId
              )
          )
        ),
    },
  };

  user = {
    get: {
      allBySearch: (SearchString: string): Promise<User[]> =>
        this.req("/GetUserLimited", "GET"),
    },
  };

  metadata = {
    fields: {
      get: {
        all: (): Promise<IField[]> => this.req("/GetFields","GET"),
      },
    },
    add: (
      TemplateId: string,
      fields: ({
        title: string;
      } & (
        | {
            type: "text" | "date" | "person" | "number" | "checkbox";
          }
        | {
            type: "dropdown";
            choices: [];
          }
      ))[]
    ) =>
      // fs.appendFile(
      //   "./log.txt",
      //   `Adding metadata fields for template ${TemplateId}:\n${JSON.stringify(
      //     fields,
      //     null,
      //     2
      //   )}\n\n`
      // ),
      this.req("/AddFieldsToTemplate","PATCH", {
        TemplateId: TemplateId.toString(),
        RemovedFields: [],
        UpdatedFields: [],
        CreatedFields: 
          fields.map((field) => ({
            ...field,
            id: -1,
            required: false,
            order: 0,
            fieldOptions: {
              choices: field.type === "dropdown" ? field.choices : [],
              isRunning: false,
              isPermissionField: false,
              permissionGroupName: "",
            },
            defaultValue: "",
            description: "",
            spInternalName: "",
            EditableBy: 0,
          }))
        ,
        AddedFields: [],
        DeletedFields: [],
      }),
  };

  team = {
    managed: {
      get: {
        all: () => this.nextIterator<SlimTeam>("/GetAllManagedTeams","GET"),
      },
    },
    unmanaged: {
      get: {
        all: () => this.nextIterator<SlimTeam>("/GetAllUnmanagedTeams","GET"),
      },
    },
    convertToManaged: (
      TemplateId: string,
      TeamId: string,
      TeamTitle: string,
      FieldValues: IFieldValue[] = []
    ) =>
      // fs.appendFile(
      //   "./log.txt",
      //   `Converting team ${TeamTitle} (${TeamId}) using template ${TemplateId} and following metadata:\n${JSON.stringify(
      //     FieldValues,
      //     null,
      //     2
      //   )}\n\n`
      // ),
      this.req(
        "/ConvertToManagedTeam",
        "PATCH",
        {
          Template: TemplateId.toString(),
          TeamId,
          IsTeam: true,
          FieldValues,
          TeamTitle,
          CurrentUser: "upn",
          RequesterComment: "",

        }
      ),
  };
}

class TM {
  static instance = new TM();
  private _instance?: _TM;
  private constructor() {}

  init = async (baseUrl: string) => {
    if (this._instance) return this._instance;
    const auth = await Auth({
      name: "TMValoMigrator",
      redirectUrl: "http://localhost:3875/oauth",
      scopes: {
        "Microsoft Graph": [
          "Directory.Read.All",
          "Group.ReadWrite.All",
          "Mail.Send",
          "User.Read",
          "User.Read.All",
          "User.ReadBasic.All",
        ],
      },
    });
    return (this._instance = new _TM(baseUrl, auth));
  };
}

export default TM.instance.init;
