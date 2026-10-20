import { catchRepository } from "../../catches/data/catchRepository.js";
import { tripRepository } from "../../trips/data/tripRepository.js";
import { waterRepository } from "../../waters/data/waterRepository.js";
import { SyncPortError } from "./syncPort.js";

const REPOSITORIES = Object.freeze({ catch: catchRepository, trip: tripRepository, water: waterRepository });

/**
 * Local CRUD adapter for domain code. It deliberately has no ownerId, delta,
 * or remote revision semantics; linking local data to an account is a
 * separate, explicit migration step.
 */
export function createLocalRepositoryAdapter(repositories = REPOSITORIES) {
  function repositoryFor(entityType) {
    const repository = repositories[entityType];
    if (!repository) throw new SyncPortError("invalid_request", "Nepodporovaný typ záznamu.");
    return repository;
  }

  return Object.freeze({
    read: async (entityType, id) => (await repositoryFor(entityType).get(id)) ?? null,
    write: async (entityType, record) => repositoryFor(entityType).put(record),
    delete: async (entityType, id) => repositoryFor(entityType).delete(id),
    list: async (entityType) => repositoryFor(entityType).list(),
  });
}
