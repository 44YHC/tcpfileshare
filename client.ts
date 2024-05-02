import { createReadStream } from "fs";
import { Socket } from "net";
import { createGzip } from "zlib";
import { createCipheriv } from "crypto";
import { randomBytes } from "crypto";
import { Readable, Writable, pipeline } from "stream";

const host = "localhost";
const port = 3000;
const key = Buffer.from(process.argv[2], "hex");
const files = process.argv.slice(3);
const iv = randomBytes(16);

const client = new Socket();

const channels: Readable[] = [];

for (let i = 0; i < files.length; i++) {
  channels[i] = pipeline(
    createReadStream(files[i]),
    createGzip(),
    createCipheriv("aes192", key, iv),
    (err) => {
      if (err) {
        console.error(err);
      }
    },
  );
}

client.connect({ port, host }, () => {
  client.write(JSON.stringify({ iv: iv.toString("hex"), files }));
  multiplex(channels, client);
});

function multiplex(channels: Readable[], destination: Writable) {
  let open = channels.length;
  for (let i = 0; i < channels.length; i++) {
    channels[i]
      .on("readable", function () {
        let chunk: Buffer;
        while ((chunk = channels[i].read()) !== null) {
          const buffer = Buffer.alloc(1 + chunk.length);
          buffer.writeUInt8(i, 0);
          chunk.copy(buffer, 1);
          console.log(`Sending packet to channel: ${i}`);
          destination.write(buffer);
        }
      })
      .on("end", () => {
        if (--open === 0) {
          destination.end();
        }
      });
  }
}
