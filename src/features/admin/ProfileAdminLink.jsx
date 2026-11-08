import { Link } from "react-router-dom";
import { canOpenAdmin } from "./adminClient.js";

export default function ProfileAdminLink({ access }) {
  return canOpenAdmin(access) ? <Link className="profile-backup-button" to="/admin">Administrace ChytnuCz →</Link> : null;
}
