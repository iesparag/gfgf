import Utils from "./Utils";

class Log {
  static instance = new Log();
  private readonly unicodes = {
    horizontal: "─",
    vertical: "│",
    corners: {
      top: {
        left: "╭",
        right: "╮",
      },
      bottom: {
        left: "╰",
        right: "╯",
      },
    },
  };
  private constructor() {}

  private _log = (type: number, msg: string) =>
    console.log(
      `\x1b[30m${
        ["\x1b[46m INFO", "\x1b[43m WARN", "\x1b[41m ERR "][type]
      } \x1b[0m`,
      msg
    );

  clear = () => {
    process.stdout.write("\u001b[3J\u001b[1J");
    console.clear();
  };

  sleepLog = async (ms: number, msg: string = "Waiting {{time}}s ...") => {
    console.log();
    while (ms) {
      process.stdout.write(
        "\x1b[30m$\x1b[46m INFO \x1b[0m " +
          msg.replace(/{{time}}/g, (ms / 1000).toFixed(0))
      );
      await Utils.sleep((ms -= ms >= 1000 ? 1000 : ms));
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    }
  };

  padLeft = (txt: string | string[], count: number = 1, char: string = " ") =>
    (Array.isArray(txt) ? txt : txt.split("\n"))
      .map((line) => `${char.repeat(count)}${line}`)
      .join("\n");

  colSpace = (items: string[][], space: number = 2) => {
    var longests = new Array(
      items.map((x) => x.length).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))[0]
    ).fill(0);
    items.forEach((cols) =>
      cols.forEach(
        (col, i) => col.length > longests[i] && (longests[i] = col.length)
      )
    );
    return items
      .map((cols) =>
        cols
          .map((col, i) => `${col}${" ".repeat(longests[i] - col.length)}`)
          .join(" ".repeat(space))
      )
      .join("\n");
  };

  box = (
    msg: string,
    options: { padding?: number; info?: boolean; log?: boolean } = {}
  ) => {
    var _options = {
      padding: 1,
      info: true,
      log: true,
      ...options,
    };
    const msgs = msg.split("\n"),
      log: string[] = [],
      logMethod = !_options.log
        ? (...msgs: any[]) => msgs.forEach((msg) => log.push(msg))
        : _options.info
        ? this.info
        : console.log;
    var longest = 0;
    msgs.forEach((x) => x.length > longest && (longest = x.length));
    const width = longest + 3 * _options.padding * 2;
    new Array(_options.padding).fill(0).forEach(() => logMethod(""));
    logMethod(
      [
        " ".repeat(3 * _options.padding),
        this.unicodes.corners.top.left,
        this.unicodes.horizontal.repeat(width),
        this.unicodes.corners.top.right,
      ].join("")
    );
    new Array(_options.padding)
      .fill(0)
      .forEach(() =>
        logMethod(
          [
            " ".repeat(3 * _options.padding),
            this.unicodes.vertical,
            " ".repeat(width),
            this.unicodes.vertical,
          ].join("")
        )
      );
    msgs.forEach((msg) => {
      var msgWithPadd = [
        " ".repeat(3 * _options.padding),
        " ".repeat(longest / 2 - msg.length / 2),
        msg,
        " ".repeat(longest / 2 - msg.length / 2),
        " ".repeat(3 * _options.padding),
      ].join("");
      while (msgWithPadd.length !== width) {
        msgWithPadd =
          msgWithPadd.length < width ? `${msgWithPadd} ` : msgWithPadd.slice(1);
      }
      logMethod(
        [
          " ".repeat(3 * _options.padding),
          this.unicodes.vertical,
          msgWithPadd,
          this.unicodes.vertical,
        ].join("")
      );
    });
    new Array(_options.padding)
      .fill(0)
      .forEach(() =>
        logMethod(
          [
            " ".repeat(3 * _options.padding),
            this.unicodes.vertical,
            " ".repeat(width),
            this.unicodes.vertical,
          ].join("")
        )
      );
    logMethod(
      [
        " ".repeat(3 * _options.padding),
        this.unicodes.corners.bottom.left,
        this.unicodes.horizontal.repeat(width),
        this.unicodes.corners.bottom.right,
      ].join("")
    );
    new Array(_options.padding).fill(0).forEach(() => logMethod(""));
    _options.log && log.forEach((x) => console.log(x));
    return log;
  };

  private readonly colors = {
    reset: "\u001b[0m",
    resetFx: (...msgs: string[]): string =>
      `${msgs.join("")}${this.colors.reset}`,
    styles: {
      bright: "\u001b[1m",
      dim: "\u001b[2m",
      underscore: "\u001b[4m",
      blink: "\u001b[5m",
      reverse: "\u001b[7m",
      hidden: "\u001b[8m",
    },
    fg: {
      black: "\u001b[30m",
      red: "\u001b[31m",
      green: "\u001b[32m",
      yellow: "\u001b[33m",
      blue: "\u001b[34m",
      magenta: "\u001b[35m",
      cyan: "\u001b[36m",
      white: "\u001b[37m",
      gray: "\u001b[90m",
    },
    bg: {
      black: "\u001b[40m",
      red: "\u001b[41m",
      green: "\u001b[42m",
      yellow: "\u001b[43m",
      blue: "\u001b[44m",
      magenta: "\u001b[45m",
      cyan: "\u001b[46m",
      white: "\u001b[47m",
      gray: "\u001b[100m",
    },
  };

  f = {
    rgb: (r: number, g: number, b: number, ...msgs: string[]) =>
      this.colors.resetFx(`\x1B[1m\x1B[38;2;${r};${g};${b}m`, msgs.join("")),
    ...(Object.fromEntries(
      Object.entries(this.colors.styles).map(([k, v]) => [
        k,
        (...msgs: string[]) =>
          this.colors.resetFx(
            v,
            msgs
              .map((msg) =>
                msg.replace(
                  new RegExp("\\u001b\\[0m", "g"),
                  this.colors.reset + v
                )
              )
              .join("")
          ),
      ])
    ) as {
      [key in keyof Log["colors"]["styles"]]: (...msgs: string[]) => string;
    }),
    fg: Object.fromEntries(
      Object.entries(this.colors.fg).map(([k, v]) => [
        k,
        (...msgs: string[]) =>
          this.colors.resetFx(
            v,
            msgs
              .map((msg) =>
                msg.replace(
                  new RegExp("\\u001b\\[0m", "g"),
                  this.colors.reset + v
                )
              )
              .join("")
          ),
      ])
    ) as { [key in keyof Log["colors"]["fg"]]: (...msgs: string[]) => string },
    bg: Object.fromEntries(
      Object.entries(this.colors.bg).map(([k, v]) => [
        k,
        (...msgs: string[]) =>
          this.colors.resetFx(
            v,
            msgs
              .map((msg) =>
                msg.replace(
                  new RegExp("\\u001b\\[0m", "g"),
                  this.colors.reset + v
                )
              )
              .join("")
          ),
      ])
    ) as { [key in keyof Log["colors"]["bg"]]: (...msgs: string[]) => string },
  };

  info = (msg: string) => this._log(0, msg);

  warn = (msg: string) => this._log(1, msg);

  err = (msg: string) => this._log(2, msg);

  crash = (msg: string, err?: string) => {
    this._log(2, msg);
    err &&
      console.log(
        err
          .split("\n")
          .map((line) => "       " + line)
          .join("\n")
      );
    process.exit(1);
  };
}

export default Log.instance;
