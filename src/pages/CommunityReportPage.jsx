import { Navigate, useLocation, useParams } from "react-router-dom";

export default function CommunityReportPage() {
  const { postId } = useParams();
  const { search, hash, state } = useLocation();
  if (!/^[a-f0-9]{64}$/.test(postId ?? "")) return <Navigate to="/community" replace />;
  const params = new URLSearchParams(search);
  params.set("report", "1");
  return <Navigate to={{ pathname: "/community/post/" + postId, search: params.toString(), hash }} state={state} replace />;
}
