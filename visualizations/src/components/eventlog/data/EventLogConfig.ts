import Connection from "@/data/Connection";

export default class EventLogConfig {
    // PROPERTIES MUST BE INITIALISED
    // OTHERWISE VUE DOES NOT MAKE THEM REACTIVE
    // !!!!!

    // single-connection selection (one qlog file = one connection); the stored
    // connection is always markRaw(toRaw(...))'d by the configurator so it never
    // becomes a reactive proxy
    public connections:Array<Connection> = new Array<Connection>();

    // case-insensitive substring filter (debounced by the configurator before it
    // lands here) matched against the precomputed EventLogRow.searchStr
    public filterText:string = "";

    // canonical category filter; "" = all categories
    public selectedCategory:string = "";
}
