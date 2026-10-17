import { openLocalDatabase } from "../../catches/data/catchRepository.js";

export function readLocalBackupSnapshot() {
  return openLocalDatabase().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(["catches", "trips"], "readonly");
    const catchesRequest = transaction.objectStore("catches").getAll();
    const tripsRequest = transaction.objectStore("trips").getAll();
    let catches;
    let trips;
    let failure;

    catchesRequest.onsuccess = () => { catches = catchesRequest.result; };
    tripsRequest.onsuccess = () => { trips = tripsRequest.result; };
    catchesRequest.onerror = () => { failure = catchesRequest.error; transaction.abort(); };
    tripsRequest.onerror = () => { failure = tripsRequest.error; transaction.abort(); };
    transaction.oncomplete = () => {
      db.close();
      resolve({ catches, trips });
    };
    transaction.onerror = () => {
      db.close();
      reject(failure ?? transaction.error ?? new Error("Místní data se nepodařilo načíst."));
    };
    transaction.onabort = () => {
      db.close();
      reject(failure ?? transaction.error ?? new Error("Načtení místních dat bylo přerušeno."));
    };
  }));
}
