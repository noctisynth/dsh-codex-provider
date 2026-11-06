import { useState } from "react";
import { UserRound } from "lucide-react";

export function AccountAvatar({
  name,
  picture,
}: {
  name?: string | null;
  picture?: string | null;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className="cp:flex cp:size-9 cp:shrink-0 cp:items-center cp:justify-center cp:overflow-hidden cp:rounded-full cp:bg-muted cp:text-sm cp:font-medium cp:text-muted-foreground">
      {picture && picture !== failed ? (
        <img
          src={picture}
          alt=""
          referrerPolicy="no-referrer"
          className="cp:size-full cp:object-cover"
          onError={() => setFailed(picture)}
        />
      ) : name?.trim() ? (
        Array.from(name.trim())[0]
      ) : (
        <UserRound aria-hidden="true" className="cp:size-4" />
      )}
    </div>
  );
}
