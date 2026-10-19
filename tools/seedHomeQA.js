import { catchRepository, getActiveGuestScopeKey } from "../src/features/catches/data/catchRepository.js";
import { tripRepository } from "../src/features/trips/data/tripRepository.js";
import { createHomeJournalFixture } from "../src/test/fixtures/homeJournalFixture.js";

const fixture = createHomeJournalFixture(new Date());
const scope = { scopeKey: await getActiveGuestScopeKey(), ownerId: null };
for (const trip of fixture.trips) await tripRepository.put(trip, scope);
for (const record of fixture.catches) await catchRepository.put(record, scope);
document.documentElement.dataset.qaFixture = "home-seeded";
