import { EventSchemas, Inngest } from "inngest";

type Events = {
  "app/collect.requested": { data: { userId?: string } };
  "opportunity/created": { data: { opportunityId: string } };
  "application/prepare": { data: { opportunityId: string } };
  "application/send": { data: { applicationId: string } };
};

export const inngest = new Inngest({
  id: "alternance-pilot",
  schemas: new EventSchemas().fromRecord<Events>(),
});
