import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/context/authContextValue.js";
import { createAdminClient } from "../admin/adminClient.js";

export function useOwnModeration() {
  const { user } = useAuth(), uid = user?.uid ?? null;
  const client = useMemo(() => createAdminClient({ ownerId: uid }), [uid]);
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!uid) return undefined;
    const controller = new AbortController();
    const refresh = () => client.request("moderation.own", {}, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setState({ uid, records: value.records }); }).catch(() => {});
    void refresh(); window.addEventListener("focus", refresh); window.addEventListener("online", refresh);
    return () => { controller.abort(); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); };
  }, [client, uid]);
  return useMemo(() => new Map((state?.uid === uid ? state.records : []).map(record => [record.catchId, record])), [state, uid]);
}
