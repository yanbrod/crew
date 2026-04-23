import { Writable } from "node:stream";
import chalk from "chalk";

export interface TeeOptions {
  name: string;
  color: (text: string) => string;
  out: { write: (chunk: string) => boolean };
}

export function createPrefixedTee(opts: TeeOptions): Writable {
  let buf = "";
  const prefix = opts.color(`[${opts.name}] `);

  const emit = (line: string) => {
    opts.out.write(prefix + line + "\n");
  };

  return new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      buf += chunk.toString();
      let idx = buf.indexOf("\n");
      while (idx !== -1) {
        emit(buf.slice(0, idx));
        buf = buf.slice(idx + 1);
        idx = buf.indexOf("\n");
      }
      cb();
    },
    final(cb) {
      if (buf.length > 0) {
        emit(buf);
        buf = "";
      }
      cb();
    },
  });
}

const palette = [chalk.cyan, chalk.magenta, chalk.yellow, chalk.green, chalk.blue, chalk.red];

export function colorFor(index: number): (text: string) => string {
  const fn = palette[index % palette.length];
  return fn!;
}
