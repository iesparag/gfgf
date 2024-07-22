import fs from "fs/promises";
import path from "path";
import Log from "./Log";
import cp from "child_process";
import inquirer from "inquirer";
import statics from "../statics";

type PromptOptions = {
  abortSignal?: AbortSignal;
} & ({ selectMulti?: false } | { selectMulti: true; min?: number });

class Utils {
  static instance = new Utils();
  private readonly cwd = process.cwd();

  // private header = Log.box("Welcome to the TM Migration Script\nv0.1 beta", {
  //   log: false,
  // })
  //   .map((x, i) =>
  //     i < 1 ? x : Log.f.rgb(93, 97, 184, statics.govy.shift() || "") + x
  //   )
  //   .map((x) => "  " + x)
  //   .join("\n");
  private header = [
    "  ",
    "  \u001b[1m\u001b[38;2;93;97;184m╭─────╮\u001b[0m   ╭────────────────────────────────────────╮",
    "  \u001b[1m\u001b[38;2;93;97;184m│ ⬤ ⬤ │\u001b[0m   │                                        │",
    "  \u001b[1m\u001b[38;2;93;97;184m╰─────╯\u001b[0m   │   Welcome to the TM Migration Script   │",
    "  \u001b[1m\u001b[38;2;93;97;184m╭─────╮\u001b[0m   │               v0.1 beta                │",
    "  \u001b[1m\u001b[38;2;93;97;184m│     │\u001b[0m   │                                        │",
    "  \u001b[1m\u001b[38;2;93;97;184m╰╮   ╭╯\u001b[0m   ╰────────────────────────────────────────╯",
    "  \u001b[1m\u001b[38;2;93;97;184m ╰───╯ \u001b[0m\n",
  ].join("\n");
  clearWH = (...heading: string[]) => {
    Log.clear();
    console.log(this.header);
    heading.length && console.log(`${heading.join("\n")}\n`);
  };

  isAdmin = false;
  private constructor() {
    try {
      cp.execSync("net session", { stdio: "ignore" });
      this.isAdmin = true;
    } catch {}
  }

  prmpt = <
    Item extends { name: string; value: any },
    Options extends PromptOptions
  >(
    message: string,
    items: (Item | inquirer.Separator)[],
    options?: Options
  ): Promise<
    Options["selectMulti"] extends true ? Item["value"][] : Item["value"]
  > =>
    new Promise((res, rej) => {
      const prms = inquirer.prompt({
        name: "x",
        message,
        choices: items,
        type: options?.selectMulti === true ? "checkbox" : "list",
        validate:
          options?.selectMulti === true
            ? (a) =>
                a.length < (options.min || 1)
                  ? "You must choose at least one item"
                  : true
            : undefined,
      });

      options?.abortSignal &&
        (options.abortSignal.onabort = () => {
          (prms.ui as any).close();
          rej();
        });

      prms.then((x) => res(x.x));
    });

  input = async (
    q: string,
    vld?: (i: string) => true | string,
    abortSignal?: AbortSignal
  ): Promise<string> =>
    new Promise((res, rej) => {
      const prms = inquirer.prompt({
        type: "input",
        name: "input",
        message: q,
        validate: vld,
      });

      abortSignal &&
        (abortSignal.onabort = () => {
          (prms.ui as any).close();
          rej();
        });

      prms.then((x) => res(x.input));
    });

  yesno = async (q?: string): Promise<boolean> =>
    inquirer
      .prompt({
        type: "confirm",
        name: "prompt",
        message: q,
      })
      .then((x) => x.prompt);

  fs = {
    ...fs,
    path: (file: string) => path.join(this.cwd, file),
    exists: (file: string) =>
      fs
        .access(this.fs.path(file), fs.constants.F_OK)
        .then(() => true)
        .catch(() => false),
    vldtDir: (file: string) =>
      this.fs
        .exists(file)
        .then(async (x) => !x && (await fs.mkdir(this.fs.path(file)))),
    readJSON: async (file: string, join = true) =>
      JSON.parse(
        (await fs.readFile(join ? this.fs.path(file) : file)).toString()
      ),
    writeJSON: async (file: string, data: any, format = false) =>
      fs.writeFile(
        this.fs.path(file),
        JSON.stringify(data, null, format ? 2 : undefined)
      ),
  };

  deepClone = <T extends {}>(obj: T): T => ({
    ...obj,
    ...Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => typeof v === "object" && !Array.isArray(v))
        .map(([k, v]) => [k, this.deepClone(v as any)])
    ),
  });

  openLink = (url: string) =>
    cp.exec(["start", url.replace(/\&/g, "^&")].join(" "));

  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  decodeJWT = (token: string) =>
    JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());

  task = async <T extends void | Promise<any>>(
    task: string,
    fx: () => T
  ): Promise<T> => {
    Log.info(task[0].toUpperCase() + task.slice(1) + "...");
    var res: any;
    try {
      res = await fx();
    } catch (err) {
      return Log.crash(
        `Error while ${task}:`,
        typeof err === "string" ? err : (err as any)?.message || "Unkown error"
      );
    }
    Log.info("Finished " + task + "\n");
    return res;
  };
}

export default Utils.instance;
