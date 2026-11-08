import { Link } from "react-router-dom";
import { canOpenAdmin } from "./adminClient.js";

export default function ProfileAdminLink({ access }) {
  return canOpenAdmin(access) ? <Link className="profile-stats-link" to="/admin"><span><strong>Administrace ChytnuCz</strong><small>Správa aplikace, uživatelů a nastavení</small></span><b aria-hidden="true">→</b></Link> : null;
}
