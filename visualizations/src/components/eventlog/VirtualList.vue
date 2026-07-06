<template>
    <div ref="containerEl" class="virtual-list" @scroll.passive="onScroll">
        <div class="virtual-list-spacer" :style="{ height: (itemCount * rowHeight) + 'px' }">
            <div class="virtual-list-window" :style="{ transform: 'translateY(' + (windowStart * rowHeight) + 'px)' }">
                <div v-for="i in windowIndices" :key="i" class="virtual-list-item" :style="{ height: rowHeight + 'px' }">
                    <!-- The scoped slot only receives the item INDEX; the parent resolves
                         index -> row itself so item objects never travel through props
                         (and therefore never get proxied by Vue's reactivity). -->
                    <slot :index="i"></slot>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    // Small hand-rolled fixed-row-height windowed list (no dependencies).
    // Real captures run to 10^5+ events; a naive v-for locks the tab, so both the
    // event list and the stream-context list render only the visible window
    // (plus overscan) over a full-height spacer div.
    import { computed, onBeforeUnmount, onMounted, ref } from "vue";

    const props = defineProps<{
        itemCount: number;
        rowHeight: number; // px, fixed for every row
    }>();

    const OVERSCAN = 10; // rows rendered beyond each edge of the viewport

    const containerEl = ref<HTMLElement | null>(null);
    // Only small scalars are reactive here: scroll offset + viewport height.
    const scrollTop = ref(0);
    const viewportHeight = ref(0);

    let resizeObserver: ResizeObserver | undefined;

    function onScroll(): void {
        if (containerEl.value) {
            scrollTop.value = containerEl.value.scrollTop;
        }
    }

    onMounted(() => {
        const el = containerEl.value;
        if (el) {
            viewportHeight.value = el.clientHeight;
            resizeObserver = new ResizeObserver(() => {
                if (containerEl.value) {
                    viewportHeight.value = containerEl.value.clientHeight;
                }
            });
            resizeObserver.observe(el);
        }
    });

    onBeforeUnmount(() => {
        resizeObserver?.disconnect();
        resizeObserver = undefined;
    });

    const windowStart = computed(() => {
        const first = Math.floor(scrollTop.value / props.rowHeight) - OVERSCAN;
        // clamp against a stale scrollTop after the item count shrinks (e.g. filtering)
        return Math.max(0, Math.min(first, Math.max(0, props.itemCount - 1)));
    });

    const windowEnd = computed(() => {
        const last = Math.ceil((scrollTop.value + viewportHeight.value) / props.rowHeight) + OVERSCAN;
        return Math.min(props.itemCount, Math.max(last, windowStart.value));
    });

    const windowIndices = computed(() => {
        const indices: number[] = [];
        for (let i = windowStart.value; i < windowEnd.value; i++) {
            indices.push(i);
        }
        return indices;
    });

    // Scrolls row i into view only when it is outside the current viewport,
    // centering it. Rows already fully visible are left alone so click-to-select
    // never yanks the list around.
    function scrollToIndex(i: number): void {
        const el = containerEl.value;
        if (!el || i < 0 || i >= props.itemCount) {
            return;
        }

        const rowTop = i * props.rowHeight;
        const rowBottom = rowTop + props.rowHeight;
        const viewTop = el.scrollTop;
        const viewBottom = viewTop + el.clientHeight;

        if (rowTop >= viewTop && rowBottom <= viewBottom) {
            return; // already fully visible
        }

        const centered = rowTop - (el.clientHeight - props.rowHeight) / 2;
        const maxScroll = Math.max(0, props.itemCount * props.rowHeight - el.clientHeight);
        el.scrollTop = Math.max(0, Math.min(centered, maxScroll));
        scrollTop.value = el.scrollTop;
    }

    defineExpose({ scrollToIndex });
</script>

<style scoped>
    .virtual-list {
        overflow-y: auto;
        overflow-x: hidden;
        position: relative;
    }

    .virtual-list-spacer {
        position: relative;
        width: 100%;
    }

    .virtual-list-window {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        will-change: transform;
    }

    .virtual-list-item {
        overflow: hidden;
    }
</style>
