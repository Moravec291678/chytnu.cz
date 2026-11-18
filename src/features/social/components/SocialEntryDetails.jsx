export default function SocialEntryDetails({ post }) {
  const { achievement, progression } = post.content;
  return <>
    {post.kind && post.kind !== "catch" && <p className="online-post-context">{{ experience: "Zážitek od vody", achievement: "Sdílený úspěch", milestone: "Potvrzený milník" }[post.kind] || "Příspěvek"}</p>}
    {post.kind === "achievement" && achievement && <p className="online-post-context"><strong>{achievement.title}</strong><br />Nahlášený úspěch · server jeho splnění neověřil.</p>}
    {post.kind === "milestone" && progression?.source === "server" && <p className="online-post-context">Úroveň {progression.level} · {progression.xp} XP<br />Stav ze serverem potvrzených událostí v době sdílení.</p>}
  </>;
}
