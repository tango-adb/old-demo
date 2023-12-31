import * as url from "url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

import config from "./webpack.plugin.config.mjs";

export default () =>
    config({
        name: "web-demo",
        dirname: __dirname,
        externals: ["@yume-chan/adb", "@yume-chan/stream-extra"],
    });
