import type { Router } from "vue-router";
import { notify } from "@kyvg/vue3-notification";
import FileLoader from "@/components/filemanager/data/FileLoader";
import { useConnectionStore } from "@/store/ConnectionStore";

interface EmbeddedQvisFile {
    name?: string;
    data?: ArrayBuffer | ArrayBufferView;
}

interface EmbeddedLoadMessage {
    type?: string;
    loadId?: string;
    files?: EmbeddedQvisFile[];
}

function getEmbedParams(): URLSearchParams {
    return new URLSearchParams(window.location.search);
}

export function isEmbeddedMode(): boolean {
    return getEmbedParams().get("embedded") === "1";
}

function targetOrigin(): string {
    return window.location.protocol === "file:" ? "*" : window.location.origin;
}

function messageOriginAllowed(event: MessageEvent): boolean {
    if (event.origin === window.location.origin) {
        return true;
    }

    return window.location.protocol === "file:" && event.origin === "null";
}

function toArrayBuffer(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
    if (data instanceof ArrayBuffer) {
        return data.slice(0);
    }

    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const copy = new Uint8Array(view.byteLength);
    copy.set(view);
    return copy.buffer;
}

async function loadEmbeddedFiles(files: EmbeddedQvisFile[]): Promise<void> {
    const store = useConnectionStore();

    for (let i = 0; i < files.length; i++) {
        const input = files[i];
        if (!input || !input.data) {
            throw new Error(`Embedded qvis file ${i + 1} is missing data.`);
        }

        const name = input.name || `connection-${i + 1}.qlog`;
        const file = new File([toArrayBuffer(input.data)], name, { type: "application/qlog" });
        const result = await FileLoader.Load(file, name);
        if (result.error !== undefined) {
            throw result.error;
        }

        await store.addGroupFromQlogFile({
            fileContentsJSON: result.qlogJSON,
            fileInfo: { filename: name },
        });
    }

    notify({
        group: "default",
        title: "Loaded embedded qlog files",
        type: "success",
        text: `${files.length} qlog file${files.length === 1 ? "" : "s"} loaded from the parent viewer.`,
    });
}

export function initEmbedMode(_router: Router): boolean {
    const params = getEmbedParams();
    if (params.get("embedded") !== "1") {
        return false;
    }

    const loadId = params.get("loadId") || "";
    const store = useConnectionStore();
    store.setEmbeddedMode(true);

    // One loadId is minted per embed, so the load message must only be honored once:
    // a replayed/duplicated message would otherwise load duplicate connection groups.
    let loaded = false;

    window.addEventListener("message", (event: MessageEvent<EmbeddedLoadMessage>) => {
        if (event.source !== window.parent) {
            return;
        }
        if (!messageOriginAllowed(event)) {
            return;
        }

        const message = event.data || {};
        if (message.type !== "qvis-load-files" || message.loadId !== loadId || !Array.isArray(message.files)) {
            return;
        }

        if (loaded) {
            return;
        }
        loaded = true;

        loadEmbeddedFiles(message.files).catch((error) => {
            console.error("qvis embed: failed to load embedded files", error);
            notify({
                group: "default",
                title: "Embedded qlog load failed",
                type: "error",
                duration: 6000,
                text: "qvis could not load the qlog files sent by the parent viewer. See the JavaScript console for details.",
            });
        });
    });

    window.parent.postMessage({
        type: "qvis-ready",
        loadId,
    }, targetOrigin());

    return true;
}
