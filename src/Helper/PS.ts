import cp from "child_process";
import * as crypto from "crypto";
import Log from "./Log";

class PS {
  static instance = new PS();
  private readonly debug = false;
  private constructor() { }

  private readonly debugLog = (...args: Parameters<typeof console.log>) =>
    this.debug && console.log(...args);

  installModule = (moduleId: string) =>
    this.run([
      "$orig = $ProgressPreference",
      '$ProgressPreference = "SilentlyContinue"',
      `if((Get-Module ${moduleId} -ListAvailable).Length -lt 1) { Install-Module ${moduleId} -Scope CurrentUser -Force }`,
      "J",
      "J",
      "$ProgressPreference = $orig",
      "exit 0",
    ]);

  spawn = (
    cmds: string[],
    options?: { processOptions?: cp.SpawnOptionsWithoutStdio }
  ) => {
    options = {
      processOptions: {},
      ...options
    };
    const child = cp.spawn("powershell.exe", [], {
      cwd: process.cwd(),
      env: process.env,
      ...options.processOptions,
    });
    var onData: (data: string) => void,
      onErr: (err: string) => void,
      onExit: (code: number) => void,
      onDataForVars = (data: string) => { };
    child.on("exit", (code) => onExit && onExit(code || 0));
    child.on("error", (err) => {
      this.debugLog(err.toString());
      onErr && onErr(err.toString());
    });
    child.stderr.on("data", (err) => {
      this.debugLog(err.toString());
      onErr && onErr(err.toString());
    });
    child.stdout.on("data", (data) => {
      const line = data.toString();
      onDataForVars(line);
      this.debugLog(line);
      if (!onData) return;
      if (/^PS [A-Z]:(\\.*)*>/.test(line.trim())) return;
      onData(line);
    });
    cmds.forEach((cmd) => child.stdin.write(`${cmd}\n`));
    const funcs = {
      kill: () => !child.killed && child.kill(),
      onExit: (fx: typeof onExit) => {
        onExit = fx;
        return funcs;
      },
      exec: (cmds: string[]) => {
        cmds.forEach((cmd) => child.stdin.write(`${cmd}\n`));
        return funcs;
      },
      onErr: (fx: typeof onErr) => {
        onErr = fx;
        return funcs;
      },
      onData: (fx: typeof onData) => {
        onData = fx;
        return funcs;
      },
      getVars: <T extends { [varName: string]: string }>(vars: T): Promise<T> =>
        new Promise((r) => {
          const varRefs = Object.entries(vars).map(([k, v]) => [
            k,
            v,
            crypto.randomUUID(),
          ]),
            varResults = Object.fromEntries(
              Object.keys(vars).map((k) => [k, undefined])
            ) as any as T;
          onDataForVars = (line) => {
            varRefs.forEach(
              ([name, _, ref]) =>
                line.trim().startsWith(`VAR_${ref} `) &&
                ((varResults as any)[name] = line
                  .trim()
                  .slice(`VAR_${ref} `.length))
            );
            if (
              Object.keys(vars).every(
                (varName) =>
                  Object.keys(varResults).includes(varName) &&
                  varResults[varName] !== undefined
              )
            ) {
              onDataForVars = () => { };
              return r(varResults);
            }
          };
          varRefs
            .map(([_, cmd, ref]) => `Write-Host "VAR_${ref} $(${cmd})"`)
            .forEach((cmd) => child.stdin.write(`${cmd}\n`));
        }),
    };
    return funcs;
  };

  selectFileDialog = async <
    T extends {
      cwd?: string;
      forceSelect?: boolean;
      fileTypes?: { [description: string]: string };
    }
  >(
    options: T = {} as any
  ): Promise<T["forceSelect"] extends true ? string : string | undefined> => {
    let file: any;

    const openFileDialog = async (): Promise<string | undefined> => {
      return new Promise<string | undefined>((resolve) => {
        const ps = this.spawn([
          "Add-Type -AssemblyName System.Windows.Forms",
          `$f = New-Object System.Windows.Forms.OpenFileDialog -Property @{ ${[
            `InitialDirectory = '${options.cwd || process.cwd()}'`,
            options.fileTypes &&
            `Filter = '${Object.entries(options.fileTypes)
              .map((x) => x.join("|"))
              .join("|")}'`,
          ]
            .filter((x) => !!x)
            .join(" ; ")} }`,
          "$n = $f.ShowDialog()",
          'Write-Output "FILE_SELECTOR_END $($f.FileName)"',
        ])
          .onErr(() => resolve(undefined))
          .onData((data) => {
            if (!data.startsWith("FILE_SELECTOR_END")) return;
            ps.kill();
            resolve(data.slice("FILE_SELECTOR_END ".length).trim());
          });
      });
    };

    do {
      file = await openFileDialog()
      if (!file) {
        Log.err("Please upload the file");
        break
      }
    } while (options.forceSelect && !file);

    return file;
  };


  run = <T extends { [varName: string]: string }>(
    cmds: Parameters<typeof this.spawn>[0],
    options?: Parameters<typeof this.spawn>[1] & { vars?: T }
  ) =>
    new Promise<[string, T]>((res, rej) => {
      const varRefs = Object.entries(options?.vars || {}).map(([k, v]) => [
        k,
        v,
        crypto.randomUUID(),
      ]),
        varResults = Object.fromEntries(
          Object.keys(options?.vars || {}).map((k) => [k, ""])
        ) as T;
      var logs = "";
      this.spawn(
        [
          ...cmds,
          ...varRefs.map(
            ([_, cmd, ref]) => `Write-Host "VAR_${ref} $(${cmd})"`
          ),
          "exit 0",
        ],
        options
      )
        .onData((line) => {
          varRefs.forEach(
            ([name, _, ref]) =>
              line.trim().startsWith(`VAR_${ref} `) &&
              ((varResults as any)[name] = line
                .trim()
                .slice(`VAR_${ref} `.length))
          );
          logs += line + "\n";
        })
        .onErr((err) => rej(err))
        .onExit((code) => (code !== 0 ? rej() : res([logs, varResults])));
    });
}

export default PS.instance;
