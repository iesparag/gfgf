import Utils from "./Utils";
import fs from "fs";
import path from "path";

class Config<T extends { [key: string]: any }> {
  private config: T = {} as any;
  constructor(private file: string) {
    try {
      this.config = JSON.parse(fs.readFileSync(Utils.fs.path(file)).toString());
    } catch {
      !fs.existsSync(Utils.fs.path(path.dirname(file))) &&
        fs.mkdirSync(Utils.fs.path(path.dirname(file)));
      fs.writeFileSync(Utils.fs.path(file), JSON.stringify(this.config));
    }
  }

  get = <K extends keyof T>(k: K): T[K] => this.config[k];

  set = <K extends keyof T>(k: K, v: T[K]): Promise<any> =>
    Utils.fs.writeJSON(this.file, Object.assign(this.config, { [k]: v }));
}

export default Config;
