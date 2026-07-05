import Connection from "@/data/Connection";
export default class CongestionGraphConfig {
    // PROPERTIES MUST BE INITIALISED
    // OTHERWISE VUE DOES NOT MAKE THEM REACTIVE
    // !!!!!

    public connection:Connection | undefined = undefined;
    public renderer!: any; // ONLY HERE FOR DEBUGGING, PROPERTY IS NOT INITIALISED ON PURPOSE SO THAT IT IS NOT MADE REACTIVE
}
