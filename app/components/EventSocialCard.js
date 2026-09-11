"use client";

import CreatorAvatar from "./CreatorAvatar.js";
import VideoFacade from "./VideoFacade.js";

export default function EventSocialCard({ post, eventName, poster = null, posterLabel = "Venue cover shown" }) {
  if (!post?.url || !post?.creator) return null;
  const label = `@${post.creator}'s post about ${eventName}`;
  return (
    <article className="wfw-social-card">
      <VideoFacade
        platform={post.platform}
        url={post.url}
        label={label}
        poster={poster}
      />
      <p className="wfw-social-cover">{poster ? `${posterLabel} · ` : ""}Open the creator&rsquo;s post.</p>
      <div className="wfw-social-credit">
        <CreatorAvatar handle={post.creator} platform={post.platform} size={38} color="#E1306C" />
        <div>
          <b>@{post.creator}</b>
          <span>Instagram post about this event</span>
        </div>
      </div>
      <a className="wfw-social-link" href={post.url} target="_blank" rel="noopener"
        aria-label={`View @${post.creator}'s Instagram post about ${eventName} (opens in a new tab)`}>
        View post on Instagram ↗
      </a>
    </article>
  );
}
