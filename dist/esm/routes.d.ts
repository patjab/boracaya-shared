export interface ApiRoute {
    /** which API: public | admin | reservations | moments */
    label: string;
    method: string;
    /** resource path, no host/stage (e.g. /events/{eventId}) */
    path: string;
}
export declare const ApiRoutes: readonly ApiRoute[];
