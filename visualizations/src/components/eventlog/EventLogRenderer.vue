<template>
    <div v-if="hasConnection" class="eventlog-root">
        <div v-if="totalRowCount === 0" class="alert alert-warning m-3" role="alert">This connection contains no events</div>

        <div v-else ref="splitEl" class="eventlog-split">
            <!-- left pane: filterable, virtualized event list -->
            <div class="eventlog-left" :style="{ flexBasis: leftPanePercent + '%' }">
                <div class="eventlog-list-header">
                    <span class="col-seq">#</span>
                    <span class="col-time">time (ms)</span>
                    <span class="col-type">event type</span>
                    <span class="col-summary">summary</span>
                </div>
                <VirtualList ref="eventListEl" class="eventlog-list" :itemCount="filteredRows.length" :rowHeight="LIST_ROW_HEIGHT">
                    <template #default="{ index }">
                        <div class="eventlog-list-row" :class="{ selected: filteredRows[index].seq === selectedSeq }" @click="selectEvent(filteredRows[index].seq)">
                            <span class="col-seq">{{ filteredRows[index].seq }}</span>
                            <span class="col-time">{{ filteredRows[index].relMs.toFixed(3) }}</span>
                            <span class="col-type" :title="filteredRows[index].typeStr">{{ filteredRows[index].typeStr }}</span>
                            <span class="col-summary" :title="filteredRows[index].summary">{{ filteredRows[index].summary }}</span>
                        </div>
                    </template>
                </VirtualList>
                <div class="eventlog-list-footer text-muted">{{ filteredRows.length }} / {{ totalRowCount }} events</div>
            </div>

            <!-- draggable splitter: 6px hit area, visual 2px line centered inside.
                 Mouse-only by design (matches the drag-zoom precedent in the
                 embedding project; touch stays with default scrolling). -->
            <div class="eventlog-divider" @mousedown="onDividerMouseDown"></div>

            <!-- right pane: selected-event details (top) + stream context (bottom) -->
            <div ref="rightPaneEl" class="eventlog-right">
                <div v-if="selectedRow === null" class="text-muted p-3">Select an event to see its details</div>

                <template v-else>
                    <div class="eventlog-details" :style="{ flexBasis: detailsPanePercent + '%' }">
                        <div class="eventlog-details-heading">#{{ selectedRow.seq }} &middot; +{{ selectedRow.relMs.toFixed(3) }} ms &middot; {{ selectedRow.typeStr }}</div>
                        <!-- TEXT INTERPOLATION ONLY: qlog field values are attacker-controlled;
                             this tree stays v-html-free -->
                        <pre class="eventlog-json">{{ selectedEventJson }}</pre>
                    </div>

                    <!-- draggable horizontal splitter between details and stream context:
                         same mouse-only pattern as the vertical one -->
                    <div class="eventlog-hdivider" @mousedown="onHDividerMouseDown"></div>

                    <div class="eventlog-streams">
                        <div v-if="selectedRow.streamIds.length === 0" class="text-muted eventlog-nostream">This event is not associated with a stream</div>

                        <template v-else>
                            <div v-if="selectedRow.streamIds.length > 1" class="eventlog-stream-pills">
                                <button v-for="streamId in selectedRow.streamIds" :key="streamId" type="button" class="btn btn-sm" :class="streamId === chosenStreamId ? 'btn-primary' : 'btn-outline-primary'" @click="chosenStreamId = streamId">
                                    Stream {{ streamId }}
                                </button>
                            </div>
                            <div v-else class="eventlog-stream-single">Stream {{ chosenStreamId }}</div>

                            <VirtualList ref="contextListEl" class="eventlog-context-list" :itemCount="contextSeqs.length" :rowHeight="CONTEXT_ROW_HEIGHT">
                                <template #default="{ index }">
                                    <div class="eventlog-context-block" :class="{ selected: contextSeqs[index] === selectedSeq }" @click="selectEvent(contextSeqs[index])">
                                        <div class="eventlog-context-separator">
                                            <span class="eventlog-context-separator-label">#{{ contextSeqs[index] }} &middot; +{{ rowForSeq(contextSeqs[index]).relMs.toFixed(3) }} ms</span>
                                        </div>
                                        <div class="eventlog-context-type" :title="rowForSeq(contextSeqs[index]).typeStr">{{ rowForSeq(contextSeqs[index]).typeStr }}</div>
                                        <div class="eventlog-context-summary" :title="rowForSeq(contextSeqs[index]).summary">{{ rowForSeq(contextSeqs[index]).summary }}</div>
                                    </div>
                                </template>
                            </VirtualList>
                        </template>
                    </div>
                </template>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed, nextTick, onBeforeUnmount, ref, shallowRef, toRaw, watch } from "vue";

    import EventLogConfig from "./data/EventLogConfig";
    import { getEventLogIndex, type EventLogIndex, type EventLogRow } from "./data/EventLogIndex";
    import VirtualList from "./VirtualList.vue";

    import type QlogConnection from "@/data/Connection";

    const props = defineProps<{
        config: EventLogConfig;
    }>();

    const LIST_ROW_HEIGHT = 24;     // px, single-line table rows
    const CONTEXT_ROW_HEIGHT = 66;  // px, separator strip + type line + summary line

    // ---------------------------------------------------------------------------
    // Reactivity rules (stats-tab lesson — hard requirements):
    // - the EventLogIndex, its rows, and the raw events NEVER become reactive
    //   proxies: the index lives in a shallowRef (no deep conversion) and the
    //   connection is toRaw()'d before use, so the WeakMap cache stays keyed on
    //   the raw object;
    // - component state is limited to small scalars (selectedSeq, chosenStreamId);
    // - computeds and template expressions are render-pure: plain lookups over
    //   plain arrays, no lazy builds, no cache resets in lifecycle hooks.
    // ---------------------------------------------------------------------------

    const connectionRef = shallowRef<QlogConnection | null>(null);
    const indexRef = shallowRef<EventLogIndex | null>(null);

    const selectedSeq = ref<number | null>(null);
    const chosenStreamId = ref<string | null>(null);

    const eventListEl = ref<InstanceType<typeof VirtualList> | null>(null);
    const contextListEl = ref<InstanceType<typeof VirtualList> | null>(null);

    // ---- draggable vertical splitter -------------------------------------
    // Only the percent scalar is reactive (drives the left pane's flex-basis);
    // drag bookkeeping stays in plain module refs/listeners. The VirtualLists
    // re-window on their own via ResizeObserver when the panes change size.
    const splitEl = ref<HTMLElement | null>(null);
    const leftPanePercent = ref(55);

    const DIVIDER_MIN_PERCENT = 20;
    const DIVIDER_MAX_PERCENT = 80;

    function onDividerMouseMove(event: MouseEvent): void {
        const split = splitEl.value;
        if (split === null) {
            return;
        }
        const rect = split.getBoundingClientRect();
        if (rect.width <= 0) {
            return;
        }
        const percent = ((event.clientX - rect.left) / rect.width) * 100;
        leftPanePercent.value = Math.min(DIVIDER_MAX_PERCENT, Math.max(DIVIDER_MIN_PERCENT, percent));
    }

    function endDividerDrag(): void {
        window.removeEventListener("mousemove", onDividerMouseMove);
        window.removeEventListener("mouseup", endDividerDrag);
        document.body.style.userSelect = "";
    }

    function onDividerMouseDown(event: MouseEvent): void {
        if (event.button !== 0) {
            return; // left button only (mouse-only interaction; touch out of scope)
        }
        event.preventDefault(); // don't start a text selection from the divider
        window.addEventListener("mousemove", onDividerMouseMove);
        window.addEventListener("mouseup", endDividerDrag);
        // guard against selecting pane text while sweeping across it mid-drag
        document.body.style.userSelect = "none";
    }

    // ---- draggable horizontal splitter (details vs stream context) --------
    // Same pattern as the vertical one: only the percent scalar is reactive,
    // it drives .eventlog-details' flex-basis within the right pane.
    const rightPaneEl = ref<HTMLElement | null>(null);
    const detailsPanePercent = ref(45);

    const HDIVIDER_MIN_PERCENT = 15;
    const HDIVIDER_MAX_PERCENT = 85;

    function onHDividerMouseMove(event: MouseEvent): void {
        const pane = rightPaneEl.value;
        if (pane === null) {
            return;
        }
        const rect = pane.getBoundingClientRect();
        if (rect.height <= 0) {
            return;
        }
        const percent = ((event.clientY - rect.top) / rect.height) * 100;
        detailsPanePercent.value = Math.min(HDIVIDER_MAX_PERCENT, Math.max(HDIVIDER_MIN_PERCENT, percent));
    }

    function endHDividerDrag(): void {
        window.removeEventListener("mousemove", onHDividerMouseMove);
        window.removeEventListener("mouseup", endHDividerDrag);
        document.body.style.userSelect = "";
    }

    function onHDividerMouseDown(event: MouseEvent): void {
        if (event.button !== 0) {
            return; // left button only (mouse-only interaction; touch out of scope)
        }
        event.preventDefault(); // don't start a text selection from the divider
        window.addEventListener("mousemove", onHDividerMouseMove);
        window.addEventListener("mouseup", endHDividerDrag);
        // guard against selecting pane text while sweeping across it mid-drag
        document.body.style.userSelect = "none";
    }

    // window-level listeners must not outlive the component (removing
    // never-added listeners is a harmless no-op)
    onBeforeUnmount(endDividerDrag);
    onBeforeUnmount(endHDividerDrag);

    // getEventLogIndex() runs when the selected connection changes — not per render
    watch(() => (props.config.connections.length > 0 ? props.config.connections[0] : null), (newConnection) => {
        const raw = newConnection ? toRaw(newConnection) : null;
        if (raw === connectionRef.value) {
            return;
        }

        connectionRef.value = raw;
        indexRef.value = raw ? getEventLogIndex(raw) : null;

        // selection is per-connection state
        selectedSeq.value = null;
        chosenStreamId.value = null;
    }, { immediate: true });

    const hasConnection = computed(() => connectionRef.value !== null);
    const totalRowCount = computed(() => (indexRef.value ? indexRef.value.rows.length : 0));

    // plain array pass over precomputed lowercase searchStr; output is a plain array
    // of row references (only rendering is windowed)
    const filteredRows = computed<EventLogRow[]>(() => {
        const index = indexRef.value;
        if (index === null) {
            return [];
        }

        const needle = props.config.filterText.trim().toLowerCase();
        const category = props.config.selectedCategory;
        if (needle === "" && category === "") {
            return index.rows;
        }

        const out: EventLogRow[] = [];
        for (const row of index.rows) {
            if (category !== "" && row.category !== category) {
                continue;
            }
            if (needle !== "" && row.searchStr.indexOf(needle) < 0) {
                continue;
            }
            out.push(row);
        }
        return out;
    });

    // If the selected event is filtered out of the visible list the selection is
    // kept (details + stream pane unchanged) — there is simply no left-list row
    // carrying the .selected class anymore.
    const selectedRow = computed<EventLogRow | null>(() => {
        const index = indexRef.value;
        if (index === null || selectedSeq.value === null) {
            return null;
        }
        return index.rows[selectedSeq.value] ?? null;
    });

    const selectedEventJson = computed(() => {
        const connection = connectionRef.value;
        if (connection === null || selectedSeq.value === null) {
            return "";
        }
        const event = connection.getEvents()[selectedSeq.value];
        return JSON.stringify(event, null, 2);
    });

    const contextSeqs = computed<number[]>(() => {
        const index = indexRef.value;
        if (index === null || chosenStreamId.value === null) {
            return [];
        }
        return index.streamIndex.get(chosenStreamId.value) ?? [];
    });

    function rowForSeq(seq: number): EventLogRow {
        // render-pure plain lookup (indexRef rows are dense: one row per event)
        return (indexRef.value as EventLogIndex).rows[seq];
    }

    function selectEvent(seq: number): void {
        selectedSeq.value = seq;
    }

    // stream choice follows the selection: keep the chosen stream when the newly
    // selected event also belongs to it, otherwise fall back to its first stream
    watch(selectedSeq, (seq) => {
        if (seq === null) {
            chosenStreamId.value = null;
            return;
        }
        const row = indexRef.value ? indexRef.value.rows[seq] : undefined;
        const streamIds = row ? row.streamIds : [];
        if (streamIds.length === 0) {
            chosenStreamId.value = null;
            return;
        }
        if (chosenStreamId.value === null || streamIds.indexOf(chosenStreamId.value) < 0) {
            chosenStreamId.value = streamIds[0];
        }
    });

    // auto-scroll the LEFT event list to the selected event (e.g. after selecting via
    // a context block whose row sits outside the left list's virtualization window);
    // scrollToIndex is a no-op when the row is already visible, so clicking a left-list
    // row directly never moves the list. When the active filter excludes the selected
    // event there is no row to scroll to — the selection is kept, nothing happens.
    watch(selectedSeq, async (seq) => {
        if (seq === null) {
            return;
        }
        await nextTick();
        const position = filteredRows.value.findIndex((row) => row.seq === seq);
        if (position >= 0) {
            eventListEl.value?.scrollToIndex(position);
        }
    });

    // auto-scroll the context list to the selected event whenever the selection or
    // the chosen stream changes; scrollToIndex is a no-op when the block is already
    // visible, so clicking a context block never resets the list's scroll position
    watch([selectedSeq, chosenStreamId], async () => {
        if (selectedSeq.value === null || chosenStreamId.value === null) {
            return;
        }
        await nextTick();
        const position = contextSeqs.value.indexOf(selectedSeq.value);
        if (position >= 0) {
            contextListEl.value?.scrollToIndex(position);
        }
    });
</script>

<style scoped>
    /* Last link of the EventLog flex chain (#app -> .eventlog-view -> .home ->
       here): the split fills exactly the viewport space below menu +
       configurator — no hardcoded height guess, so the page never overflows
       the embedding iframe by a few px. The panes scroll internally. */
    .eventlog-root {
        flex: 1 1 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    .eventlog-split {
        display: flex;
        flex-direction: row;
        flex: 1 1 0;
        /* keep a usable floor on degenerate (very short) viewports; the page
           scrolls in that case, which beats unusably squashed panes */
        min-height: 200px;
        border-top: 1px solid #dee2e6;
    }

    .eventlog-left {
        /* flex-basis is overridden inline by the splitter drag (leftPanePercent) */
        flex: 0 0 55%;
        min-width: 0; /* required so summary ellipsis can kick in */
        display: flex;
        flex-direction: column;
    }

    /* 6px grab area with the (previous border) 2px line centered in it */
    .eventlog-divider {
        flex: 0 0 6px;
        cursor: col-resize;
        background: linear-gradient(to right, transparent 2px, #dee2e6 2px, #dee2e6 4px, transparent 4px);
    }

    .eventlog-right {
        flex: 1 1 45%;
        min-width: 0;
        display: flex;
        flex-direction: column;
    }

    /* ---- left pane ---- */

    .eventlog-list-header {
        display: flex;
        flex: 0 0 auto;
        font-weight: bold;
        background-color: #f8f9fa;
        border-bottom: 2px solid #dee2e6;
        padding-right: 12px; /* rough scrollbar allowance so headers track columns */
    }

    .eventlog-list {
        flex: 1 1 auto;
        min-height: 0;
    }

    .eventlog-list-footer {
        flex: 0 0 auto;
        font-size: 12px;
        padding: 2px 8px;
        border-top: 1px solid #dee2e6;
    }

    .eventlog-list-row {
        display: flex;
        height: 100%;
        align-items: center;
        cursor: pointer;
        font-size: 13px;
    }

    .eventlog-list-row:hover {
        background-color: #f1f3f5;
    }

    .eventlog-list-row.selected {
        background-color: #cfe2ff;
    }

    .eventlog-list-header .col-seq,
    .eventlog-list-header .col-time,
    .eventlog-list-header .col-type,
    .eventlog-list-header .col-summary {
        font-family: inherit;
    }

    .col-seq {
        flex: 0 0 70px;
        text-align: right;
        padding: 0 8px 0 4px;
        font-family: monospace;
        font-variant-numeric: tabular-nums;
    }

    .col-time {
        flex: 0 0 100px;
        text-align: right;
        padding: 0 8px;
        font-family: monospace;
        font-variant-numeric: tabular-nums;
    }

    .col-type {
        flex: 0 0 240px;
        padding: 0 8px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .col-summary {
        flex: 1 1 auto;
        min-width: 0;
        padding: 0 8px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* ---- right pane: details ---- */

    .eventlog-details {
        /* flex-basis comes from the inline :style (detailsPanePercent, drag-adjustable);
           shrink allowed so short right panes never overflow */
        flex: 0 1 auto;
        min-height: 80px;
        display: flex;
        flex-direction: column;
    }

    /* the visual 2px separator line lives centered in a 6px row-resize hit area,
       mirroring .eventlog-divider */
    .eventlog-hdivider {
        flex: 0 0 6px;
        cursor: row-resize;
        background: linear-gradient(to bottom, transparent 2px, #dee2e6 2px, #dee2e6 4px, transparent 4px);
    }

    .eventlog-details-heading {
        flex: 0 0 auto;
        font-weight: bold;
        font-size: 13px;
        font-family: monospace;
        padding: 6px 10px;
        background-color: #f8f9fa;
        border-bottom: 1px solid #dee2e6;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .eventlog-json {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        margin: 0;
        padding: 8px 10px;
        font-size: 12px;
        background-color: #fdfdfd;
    }

    /* ---- right pane: stream context ---- */

    .eventlog-streams {
        /* basis 0, not auto: with auto, the virtual list's full-height spacer inflates
           this item's flex base size and the shrink pass steals height from the details
           pane, so the details flex-basis percent would not be honored exactly */
        flex: 1 1 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    .eventlog-nostream {
        padding: 10px;
    }

    .eventlog-stream-pills {
        flex: 0 0 auto;
        padding: 6px 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        border-bottom: 1px solid #dee2e6;
        background-color: #f8f9fa;
    }

    .eventlog-stream-single {
        flex: 0 0 auto;
        padding: 6px 10px;
        font-weight: bold;
        font-size: 13px;
        border-bottom: 1px solid #dee2e6;
        background-color: #f8f9fa;
    }

    .eventlog-context-list {
        flex: 1 1 auto;
        min-height: 0;
    }

    /* each context item reads as a clearly separated block, not a table row */
    .eventlog-context-block {
        height: 100%;
        cursor: pointer;
        overflow: hidden;
    }

    .eventlog-context-block.selected {
        background-color: #cfe2ff;
    }

    .eventlog-context-block:hover:not(.selected) {
        background-color: #f1f3f5;
    }

    /* visually distinct separator strip carrying #<seq> and +<relMs> ms */
    .eventlog-context-separator {
        display: flex;
        align-items: center;
        height: 22px;
        background-color: #e2d9f3;
        border-top: 1px solid #b9a5e3;
        border-bottom: 1px solid #d3c4ee;
        padding: 0 8px;
        font-family: monospace;
        font-variant-numeric: tabular-nums;
        font-size: 12px;
        font-weight: bold;
        color: #3f2d6e;
    }

    .eventlog-context-separator-label::before,
    .eventlog-context-separator-label::after {
        content: "\2014\2014"; /* em-dash rule segments around the label */
        color: #b9a5e3;
        margin: 0 6px;
    }

    .eventlog-context-type {
        padding: 2px 10px 0 10px;
        font-size: 12px;
        font-weight: bold;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .eventlog-context-summary {
        padding: 0 10px;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #495057;
    }
</style>
