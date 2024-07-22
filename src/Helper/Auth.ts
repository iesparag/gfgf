import PS from "./PS";
import Log from "./Log";
import Utils from "./Utils";
import Config from "./Config";
import http from "http";
const { task, sleep, openLink, decodeJWT } = Utils;

export interface AuthInfos {
  appReg: {
    id: string;
    secret: string;
  };
  authToken: {
    token_type: string;
    scope: string;
    access_token: string;
    refresh_token: string;
  };
}

export interface AuthConfig {
  name: string;
  redirectUrl: string;
  scopes: { [app: string]: string[] };
}

const OAuthTenant: "organizations" | "common" | "consumers" = "organizations";

class _Auth {
  constructor(
    private authConfig: AuthConfig,
    private config: Config<AuthInfos>
  ) {}

  rerunAuth = () => Auth.instance.init(this.authConfig);

  getAccessToken = async (): Promise<string> => {
    var tokenInfo = this.config.get("authToken");
    const payload = decodeJWT(tokenInfo.access_token);
    if (
      !(payload.exp * 1000 - Date.now() > 1000 * 60 * 5) &&
      !tokenInfo.refresh_token
    )
      Log.warn(
        "Access token expires in the next 5 min.\nMigration might fail since no refresh token is set!"
      );
    if (!(payload.exp * 1000 - Date.now() > 0)) {
      Log.warn("Access token is expired!");
      await this.config.set("authToken", {} as any);
      if (tokenInfo.refresh_token) {
        Log.warn("Attempting to refresh...");
        var appReg = this.config.get("appReg");
        if (!(appReg && appReg.id?.trim() && appReg.secret?.trim())) {
          Log.crash("Invalid App Registration. Restarting Auth...");
          await Auth.instance.init(this.authConfig);
          appReg = this.config.get("appReg");
        }
        const newToken = (await fetch(
          `https://login.microsoftonline.com/${OAuthTenant}/oauth2/v2.0/token`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: Object.entries({
              client_id: appReg.id,
              scope: [
                "offline_access",
                ...Object.entries(this.authConfig.scopes).map(([k, v]) =>
                  k === "Microsoft Graph"
                    ? v.map((x) => `https://graph.microsoft.com/${x}`).join(" ")
                    : v.join(" ")
                ),
              ].join(" "),
              refresh_token: tokenInfo.refresh_token,
              grant_type: "refresh_token",
              client_secret: appReg.secret,
            })
              .map(([k, v]) => `${k}=${encodeURIComponent(v || "")}`)
              .join("&"),
          }
        ).then((r) => (r.ok ? r.json() : false))) as
          | AuthInfos["authToken"]
          | false;
        if (newToken === false) {
          Log.warn("Renewal of Access Token failed. Restarting Auth...");
          return await (
            await Auth.instance.init(this.authConfig)
          ).getAccessToken();
        }
        await this.config.set("authToken", newToken);
        Log.warn("Access token refreshed! Continuing with script...");
        return newToken.access_token;
      } else {
        Log.warn("No refresh token provided! Restarting Auth...");
        return await (
          await Auth.instance.init(this.authConfig)
        ).getAccessToken();
      }
    }
    return tokenInfo.access_token;
  };
}

class Auth {
  static instance = new Auth();
  private _instance?: _Auth;
  private config = new Config<AuthInfos>("auth.json");
  private constructor() {}

  createAppReg = async (authConfig: AuthConfig) => {
    await task("installing packages", () =>
      Promise.all(
        ["AzureAD", "Microsoft.Graph.Applications"].map((moduleId) =>
          PS.installModule(moduleId)
        )
      ).catch(() => null)
    );

    const ADSession = await task(
        "authenticating",
        () =>
          new Promise<ReturnType<typeof PS.spawn>>((res, rej) => {
            const sess = PS.spawn([
              "Connect-AzureAD",
              "Connect-MgGraph -Scopes 'Application.Read.All'",
              "$sess = Get-AzureADCurrentSessionInfo",
              'Write-Host "AUTH_END"',
            ])
              .onErr((err) => rej(err))
              .onData(
                (line) => line.trim().startsWith("AUTH_END") && res(sess)
              );
          })
      ),
      sessionInfos = await ADSession.getVars({
        account: "(Get-AzureADCurrentSessionInfo).Account.Id",
        tenant: "(Get-AzureADCurrentSessionInfo).TenantDomain",
      });

    Log.info(
      `Logged in as ${sessionInfos.account} in tenant ${sessionInfos.tenant}\n`
    );

    await task(
      "registering app",
      () =>
        new Promise<void>(async (res, rej) => {
          Log.info("Getting service principals (may take a lil bit)...");
          await new Promise<void>((r) =>
            ADSession.exec([
              "$servicePrincipals = Get-MgServicePrincipal -All",
              'Write-Host "FETCH_END"',
            ])
              .onErr((err) => rej(err))
              .onData((line) => line.trim().startsWith("FETCH_END") && r())
          );
          Log.info("Extracting scopes and registering app...");
          var raIndex = 0;
          const code = [
            ...Object.entries(authConfig.scopes)
              .map(([app, scope], i) =>
                [
                  `$app${i} = ($servicePrincipals | where { $_.DisplayName -eq "${app}" })`,
                  `$req${i} = New-Object -TypeName "Microsoft.Open.AzureAD.Model.RequiredResourceAccess"`,
                  ...scope.map((ra) =>
                    [
                      `$scp${raIndex} = ($app${i}.Oauth2PermissionScopes | where { $_.Value -eq "${ra}" })`,
                      `$acc${raIndex} = New-Object -TypeName "Microsoft.Open.AzureAD.Model.ResourceAccess" -ArgumentList $scp${raIndex++}.Id,"Scope"`,
                    ].join("\n")
                  ),
                  `$req${i}.ResourceAccess = ${scope
                    .map((_, i) => `$acc${raIndex - scope.length + i}`)
                    .join(",")}`,
                  `$req${i}.ResourceAppId = $app${i}.AppId`,
                ].join("\n")
              )
              .join("\n")
              .split("\n"),
            "$newApp = 0",
            `if(!($tm = Get-AzureADApplication -Filter "DisplayName eq '${authConfig.name}'"  -ErrorAction SilentlyContinue)) { $newApp = 1; $tm = New-AzureADApplication -DisplayName "${authConfig.name}" -ReplyUrls @("${authConfig.redirectUrl}") }`,
            `Set-AzureADApplication -ObjectId $tm.ObjectId -RequiredResourceAccess @(${Object.keys(
              authConfig.scopes
            )
              .map((_, i) => `$req${i}`)
              .join(",")})`,
            `if(-not ($tm.ReplyUrls -contains "${authConfig.redirectUrl}")) { $tm.ReplyUrls += "${authConfig.redirectUrl}"; Set-AzureADApplication -ObjectId $tm.ObjectId -ReplyUrls $tm.ReplyUrls }`,
            "$startDate = Get-Date",
            "$endDate = $startDate.AddYears(3)",
            `$tmSecret = New-AzureADApplicationPasswordCredential -ObjectId $tm.ObjectId -CustomKeyIdentifier "${new Date().toISOString()}" -StartDate $startDate -EndDate $endDate`,
            "Write-Host APP_REG_END",
          ];
          ADSession.exec(code)
            .onErr((err) => rej(err))
            .onData((line) => line.trim().startsWith("APP_REG_END") && res());
        })
    );

    const appReg = await ADSession.getVars({
      id: "$tm.AppId",
      secret: "$tmSecret.Value",
    });

    if (!(appReg && appReg.id?.trim() && appReg.secret?.trim()))
      return Log.crash(
        "Error while registering application",
        "Something went wrong. Please contact Solutions2Share"
      );

    await this.config.set("appReg", appReg);

    const { newApp } = await ADSession.getVars({ newApp: "$newApp" });
    ADSession.kill();

    if (newApp === "0") {
      Log.info("Waiting 20 sec to setup");
      Log.info("Don't close the script or terminal!");
      await sleep(1000 * 20);
      return
    };
    Log.info("Waiting 30 sec to ensure App Registration is created");
    Log.info("Don't close the script or terminal!");
    await sleep(1000 * 30);
  };

  getOAuthToken = async (
    appReg: AuthInfos["appReg"],
    authConfig: AuthConfig
  ) => {
    await task("authenticating", async () => {
      var authCb = (infos: AuthInfos["authToken"]) => {};
      const server = http.createServer(async (req, res) => {
        if (!req.url) return res.end();
        const url = new URL("http://a.b" + req.url);
        if (
          !(
            url.pathname === new URL(authConfig.redirectUrl).pathname &&
            url.searchParams.has("code")
          )
        ) {
          url.searchParams.has("error") &&
            Log.err(
              `Error while generating access token${
                url.searchParams.has("error_description")
                  ? `\n${decodeURIComponent(
                      url.searchParams.get("error_description") as string
                    )}`
                  : ""
              }`
            );
          return res.end();
        }
        Log.info("Got code callback");
        Log.info("Trying to generate Access Token...");
        const code = url.searchParams.get("code");
        const rsp = await fetch(
          `https://login.microsoftonline.com/${OAuthTenant}/oauth2/v2.0/token`,
          {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: Object.entries({
              client_id: appReg.id,
              scope: [
                "offline_access",
                ...Object.entries(authConfig.scopes).map(([k, v]) =>
                  k === "Microsoft Graph"
                    ? v.map((x) => `https://graph.microsoft.com/${x}`).join(" ")
                    : v.join(" ")
                ),
              ].join(" "),
              code,
              redirect_uri: authConfig.redirectUrl,
              grant_type: "authorization_code",
              client_secret: appReg.secret,
            })
              .map(([k, v]) => `${k}=${encodeURIComponent(v || "")}`)
              .join("&"),
          }
        ).then((r) => (r.status !== 200 ? false : r.json()));
        if (rsp === false) {
          res.write("<h1>ERROR</h1>");
          server.close();
          return Log.crash(
            "Error while authenticating",
            "Couldn't generate AccessToken"
          );
        }
        res.write(
          '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>TM Migrator</title></head><body><style>html, body { width: 100%; height: 100%; margin: 0; padding: 0 }\n* { font-weight: 100 }</style><div style="width: 100%; height: 100%; background-color: #292d3e; color: white; display: flex; justify-content: center; align-items: center; font-family: sans-serif"><div style="text-align: center"><h1>Authentication Sucessfull</h1>You can close this page now</div></div></body></html>'
        );
        res.end();
        server.close();
        Log.info("Successfully generated Access Token");
        authCb(rsp);
      });
      await task(
        "starting OAuth Server",
        () =>
          new Promise<void>((r) =>
            server.listen(
              parseInt(new URL(authConfig.redirectUrl).port || "80"),
              () => r()
            )
          )
      );
      openLink(
        `https://login.microsoftonline.com/${OAuthTenant}/oauth2/v2.0/authorize?client_id=${
          appReg.id
        }&response_type=code&redirect_uri=${encodeURI(
          authConfig.redirectUrl
        )}&response_mode=query&scope=${encodeURIComponent(
          [
            "offline_access",
            ...Object.entries(authConfig.scopes).map(([k, v]) =>
              k === "Microsoft Graph"
                ? v.map((x) => `https://graph.microsoft.com/${x}`).join(" ")
                : v.join(" ")
            ),
          ].join(" ")
        )}&state=12345`
      );
      return await new Promise(
        (r) =>
          (authCb = async (infos) => {
            await this.config.set("authToken", infos);
            r(infos);
          })
      );
    });
  };

  init = async (authConfig: AuthConfig): Promise<_Auth> => {
    var appReg = this.config.get("appReg");

    if (!(appReg && appReg.id?.trim() && appReg.secret?.trim()))
      await this.createAppReg(authConfig).then(
        () => (appReg = this.config.get("appReg"))
      );

    var authInfos = this.config.get("authToken");

    if (
      !(
        authInfos &&
        authInfos.access_token?.trim() &&
        authInfos.token_type?.trim() &&
        authInfos.token_type === "Bearer"
      )
    )
      await this.getOAuthToken(appReg, authConfig).then(
        () => (authInfos = this.config.get("authToken"))
      );

    const decodedAT = decodeJWT(authInfos.access_token),
      scopes = decodedAT.scp.split(" "),
      userScopes: string[] = [];

    Object.values(authConfig.scopes).forEach((x) =>
      x.forEach((y) => userScopes.push(y))
    );

    if (userScopes.some((x) => !scopes.includes(x))) {
      Log.warn(
        "Defined scopes differ from access token scopes! Reauthenticating..."
      );
      await this.getOAuthToken(appReg, authConfig).then(
        () => (authInfos = this.config.get("authToken"))
      );
    }

    if (decodedAT.aud !== "https://graph.microsoft.com") {
      Log.warn(
        "Audience of access token isn't 'https://graph.microsoft.com'! Reauthenticating..."
      );
      await this.getOAuthToken(appReg, authConfig).then(
        () => (authInfos = this.config.get("authToken"))
      );
    }

    if (!authInfos.refresh_token?.trim()) {
      Log.warn(
        `Refresh token not found. Login required as soon as old access token expires\nAccess Token expires at ${new Date(
          decodedAT.exp * 1000
        )
          .toLocaleDateString("de-DE", {
            month: "numeric",
            day: "numeric",
            hour12: false,
            hour: "numeric",
            minute: "numeric",
          })
          .replace(
            ",",
            ""
          )}\nIf the access token expires while the migration is happening the migration could fail!`
      );
      await Log.sleepLog(5000);
    }

    return (
      this._instance || (this._instance = new _Auth(authConfig, this.config))
    );
  };
}

export default Auth.instance.init;
