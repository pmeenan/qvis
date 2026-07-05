import { defineStore } from "pinia";
import SequenceDiagramConfig from "@/components/sequencediagram/data/SequenceDiagramConfig";
import CongestionGraphConfig from "@/components/congestiongraph/data/CongestionGraphConfig";
import StatisticsConfig from "@/components/stats/data/StatisticsConfig";
import MultiplexingGraphConfig from "@/components/multiplexinggraph/data/MultiplexingGraphConfig";
import PacketizationDiagramConfig from "@/components/packetizationdiagram/data/PacketizationDiagramConfig";

export const useConfigurationStore = defineStore("configurations", {
    state: () => ({
        congestionGraphConfig: new CongestionGraphConfig(),
        sequenceDiagramConfig: new SequenceDiagramConfig(),
        statisticsConfig: new StatisticsConfig(),
        multiplexingGraphConfig: new MultiplexingGraphConfig(),
        packetizationDiagramConfig: new PacketizationDiagramConfig(),
    }),
});

export type ConfigurationStore = ReturnType<typeof useConfigurationStore>;
export default useConfigurationStore;
