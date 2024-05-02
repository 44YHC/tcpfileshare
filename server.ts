import { createServer } from "net";
import { createWriteStream, mkdir } from "fs";
import { createGunzip } from "zlib";
import { createDecipheriv, randomBytes } from "crypto";
import { PassThrough, Readable, Writable } from "stream";
import { join } from "path";

const HOST = "localhost";
const PORT = 3000;
const key = randomBytes(24);
console.log(`secret: ${key.toString("hex")}`);

mkdir("shared", (err) => {
  if (err) {
    if (err.code !== "EEXIST") {
      console.error(err);
      process.exit(1);
    }
  }
});

function demultiplex(source: Readable, destinations: Writable[]) {
  let currentChannel: number | null = null;

  source
    .on("readable", () => {
      let chunk;
      if (currentChannel === null) {
        chunk = source.read(1);
        currentChannel = chunk && chunk.readUInt8(0);
      }

      chunk = source.read();
      if (chunk === null) {
        return null;
      }

      console.log(`Received packet from: ${currentChannel}`);
      destinations[currentChannel!].write(chunk);
      currentChannel = null;
    })
    .on("end", () => {
      destinations.forEach((destination) => destination.end());
      console.log("Source channel closed");
    });
}

const server = createServer((s) => {
  console.log(`${s.remoteAddress}:${s.remotePort} connected.`);
  let iv: Buffer;
  let files: string[];
  const channels: Writable[] = [];

  function handleMeta() {
    const chunk = s.read();
    const meta: { iv: string; files: string[] } = JSON.parse(chunk.toString());
    iv = Buffer.from(meta.iv, "hex");
    files = meta.files;
    for (let i = 0; i < files.length; i++) {
      const pt = new PassThrough();
      channels[i] = pt;
      pt.pipe(createDecipheriv("aes192", key, iv))
        .pipe(createGunzip())
        .pipe(createWriteStream(join("shared", files[i]), "utf8"));
    }
    s.removeListener("readable", handleMeta);
    demultiplex(s, channels);
  }

  s.on("readable", handleMeta);
});

server.listen(PORT, HOST, () => {
  console.log("listening");
});
