import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/context/authContextValue.js";
import { createAdminClient } from "./adminClient.js";

export function useAdminSession() {
  const { user } = useAuth();
  const ownerId = user?.uid ?? null;
  const client = useMemo(() => createAdminClient({ ownerId }), [ownerId]);
  const [stored, setStored] = useState(null), [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    if (!ownerId) return undefined;
    let active = true;
    const controller = new AbortController();
    client.request("self", {}, { signal: controller.signal }).then(value => {
      if (active) setStored({ ownerId, access: value.access, error: "", version });
    }).catch(error => { if (active) setStored({ ownerId, access: null, error: error.message, version }); });
    return () => { active = false; controller.abort(); };
  }, [ownerId, client, version]);
  useEffect(() => {
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh);
    window.addEventListener("chytnu:admin-access-changed", refresh);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); window.removeEventListener("chytnu:admin-access-changed", refresh); };
  }, [refresh]);
  const current = stored?.ownerId === ownerId && stored.version === version ? stored : null;
  return { client, ownerId, access: current?.access ?? null, loading: Boolean(ownerId && !current), error: current?.error ?? "", refresh };
}

export function useAdminResource(client, action, parameters = {}) {
  const parametersKey = JSON.stringify(parameters), requestKey = JSON.stringify([client.ownerId, action, parametersKey]);
  const [stored, setStored] = useState(null), [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    client.request(action, JSON.parse(parametersKey), { signal: controller.signal }).then(data => {
      if (active) setStored({ requestKey, version, data, error: "" });
    }).catch(error => { if (active) setStored({ requestKey, version, data: null, error: error.message }); });
    return () => { active = false; controller.abort(); };
  }, [client, action, parametersKey, requestKey, version]);
  const current = stored?.requestKey === requestKey && stored.version === version ? stored : null;
  return { data: current?.data ?? null, loading: !current, error: current?.error ?? "", refresh };
}
