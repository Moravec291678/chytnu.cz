import { Link } from "react-router-dom";
import { useAdminSession } from "./useAdminSession.js";
import { canOpenAdmin } from "./adminClient.js";

export default function ProfileAdminLink() {
  const { access } = useAdminSession();
  return canOpenAdmin(access) ? <Link className="profile-backup-button" to="/admin">Administrace ChytnuCz →</Link> : null;
}
