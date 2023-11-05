import { NOOP, decodeUtf8, encodeUtf8 } from "@yume-chan/adb";
import {
    ConsumableWritableStream,
    WritableStream,
} from "@yume-chan/stream-extra";
import { makeAutoObservable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { NextPage } from "next";
import { GLOBAL_STATE } from "../state";

const state = makeAutoObservable({
    log: [] as string[],
});

reaction(
    () => GLOBAL_STATE.adb,
    async (device) => {
        if (!device) {
            return;
        }

        const socket = await device.createSocket("tcp:27042");
        runInAction(() => {
            state.log.push(`connected`);
        });
        const writer = socket.writable.getWriter();
        await ConsumableWritableStream.write(writer, encodeUtf8("Hello\n"));

        const reader = socket.readable.getReader();
        const result = await reader.read();
        if (result.value) {
            runInAction(() => {
                state.log.push(`received: ${decodeUtf8(result.value!)}`);
            });
        }
    },
    { fireImmediately: true },
);

const ForwardTesterPage: NextPage = () => {
    return (
        <div>
            {state.log.map((line, index) => (
                <div key={index}>{line}</div>
            ))}
        </div>
    );
};

export default observer(ForwardTesterPage);
