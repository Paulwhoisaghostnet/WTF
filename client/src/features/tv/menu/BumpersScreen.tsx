import type { Dispatch, MutableRefObject, ReactElement, SetStateAction } from "react";
import {
  MenuBtn,
  MenuDivider,
  MenuInput,
  MenuItem,
  MenuLabel,
  MenuOverlay,
  MenuRow,
  MenuScrollList,
  MenuTitle,
} from "../TVChrome";
import type { CommunityBumper, TVBumper } from "../types";

type BumperCategory = "personal" | "community";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type QueryLike<TData> = {
  data?: TData;
  isLoading?: boolean;
};

type MutationLike<TVariables> = {
  error?: unknown;
  isError?: boolean;
  isPending?: boolean;
  mutate: (variables: TVariables) => void;
};

type BumpersScreenProps = {
  bumperCategoryDraft: BumperCategory;
  bumperFileRef: MutableRefObject<HTMLInputElement | null>;
  bumperTitleDraft: string;
  communityBumpersQuery: QueryLike<CommunityBumper[]>;
  deleteBumperMutation: MutationLike<number>;
  myBumpersQuery: QueryLike<TVBumper[]>;
  renderBackBtn: (label?: string) => ReactElement;
  setBumperCategoryDraft: StateSetter<BumperCategory>;
  setBumperTitleDraft: StateSetter<string>;
  updateBumperMutation: MutationLike<{
    bumperId: number;
    category: BumperCategory;
  }>;
  uploadBumperMutation: MutationLike<{
    file: File;
    title: string;
    durationMs: number;
    category: BumperCategory;
  }>;
};

export function BumpersScreen({
  bumperCategoryDraft,
  bumperFileRef,
  bumperTitleDraft,
  communityBumpersQuery,
  deleteBumperMutation,
  myBumpersQuery,
  renderBackBtn,
  setBumperCategoryDraft,
  setBumperTitleDraft,
  updateBumperMutation,
  uploadBumperMutation,
}: BumpersScreenProps) {
  const allMine = myBumpersQuery.data || [];
  const myPersonal = allMine.filter(
    (b) => (b.category || "personal") === "personal"
  );
  const myCommunity = allMine.filter(
    (b) => (b.category || "personal") === "community"
  );
  const personalMax = 20;
  const communityMax = 3;
  const currentMax =
    bumperCategoryDraft === "community" ? communityMax : personalMax;
  const currentCount =
    bumperCategoryDraft === "community" ? myCommunity.length : myPersonal.length;
  const atLimit = currentCount >= currentMax;

  return (
    <MenuOverlay>
      <MenuTitle>
        <span>BUMPERS</span>
        {renderBackBtn("CREATOR")}
      </MenuTitle>
      <MenuLabel>
        Upload short clips (max 30 s) that play between playlist items.
        Personal bumpers only play on your own channels; community bumpers can
        be pulled into anyone&apos;s channel rotation. You can pull a shared
        bumper back out of the public pool without deleting the clip.
      </MenuLabel>
      <MenuDivider />

      <MenuLabel>
        MY PERSONAL BUMPERS ({myPersonal.length}/{personalMax})
      </MenuLabel>
      <MenuScrollList>
        {myPersonal.map((b) => (
          <MenuItem key={b.id}>
            <MenuRow>
              <span style={{ flex: 1 }}>{b.title}</span>
              <MenuLabel>
                {(b.durationMs / 1000).toFixed(1)}s ·{" "}
                {(b.fileSize / 1024).toFixed(0)}KB
              </MenuLabel>
              <MenuBtn
                $accent
                disabled={updateBumperMutation.isPending}
                onClick={() =>
                  updateBumperMutation.mutate({
                    bumperId: b.id,
                    category: "community",
                  })
                }
              >
                SHARE
              </MenuBtn>
              <MenuBtn
                disabled={deleteBumperMutation.isPending}
                onClick={() => deleteBumperMutation.mutate(b.id)}
              >
                DELETE
              </MenuBtn>
            </MenuRow>
          </MenuItem>
        ))}
        {myPersonal.length === 0 && (
          <MenuItem $disabled>No personal bumpers uploaded yet</MenuItem>
        )}
      </MenuScrollList>

      <MenuDivider />
      <MenuLabel>
        MY COMMUNITY BUMPERS ({myCommunity.length}/{communityMax})
      </MenuLabel>
      <MenuScrollList>
        {myCommunity.map((b) => (
          <MenuItem key={b.id}>
            <MenuRow>
              <span style={{ flex: 1 }}>{b.title}</span>
              <MenuLabel>
                {(b.durationMs / 1000).toFixed(1)}s ·{" "}
                {(b.fileSize / 1024).toFixed(0)}KB
              </MenuLabel>
              <MenuBtn
                $accent
                disabled={updateBumperMutation.isPending}
                onClick={() =>
                  updateBumperMutation.mutate({
                    bumperId: b.id,
                    category: "personal",
                  })
                }
              >
                PULL
              </MenuBtn>
              <MenuBtn
                disabled={deleteBumperMutation.isPending}
                onClick={() => deleteBumperMutation.mutate(b.id)}
              >
                DELETE
              </MenuBtn>
            </MenuRow>
          </MenuItem>
        ))}
        {myCommunity.length === 0 && (
          <MenuItem $disabled>No community bumpers uploaded yet</MenuItem>
        )}
      </MenuScrollList>

      <MenuDivider />
      <MenuLabel>UPLOAD NEW BUMPER</MenuLabel>
      <MenuRow style={{ marginTop: 6, gap: "clamp(6px, 1vw, 10px)" }}>
        <MenuBtn
          $accent={bumperCategoryDraft === "personal"}
          onClick={() => setBumperCategoryDraft("personal")}
        >
          PERSONAL ({myPersonal.length}/{personalMax})
        </MenuBtn>
        <MenuBtn
          $accent={bumperCategoryDraft === "community"}
          onClick={() => setBumperCategoryDraft("community")}
        >
          COMMUNITY ({myCommunity.length}/{communityMax})
        </MenuBtn>
      </MenuRow>
      <MenuRow style={{ marginTop: 6 }}>
        <MenuInput
          value={bumperTitleDraft}
          onChange={(e) => setBumperTitleDraft(e.target.value)}
          placeholder="Bumper title..."
          style={{ flex: 1 }}
        />
      </MenuRow>
      <MenuRow style={{ marginTop: 6 }}>
        <input
          ref={bumperFileRef}
          type="file"
          accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska,image/gif,image/webp,image/apng,image/png,image/jpeg"
          style={{
            fontFamily: "'Courier New', monospace",
            fontSize: "clamp(10px, 1.3vw, 14px)",
            color: "#88ffaa",
            background: "transparent",
            border: "none",
            width: "100%",
          }}
        />
      </MenuRow>
      <MenuRow style={{ marginTop: 8 }}>
        <MenuBtn
          $accent
          disabled={uploadBumperMutation.isPending || atLimit}
          onClick={async () => {
            const file = bumperFileRef.current?.files?.[0];
            if (!file) return;
            if (file.size > 80 * 1024 * 1024) {
              alert("File too large. Max 80MB.");
              return;
            }
            const kindIsStill = /^image\/(png|jpeg|webp|apng)$/i.test(
              file.type
            );
            const kindIsGif = file.type === "image/gif";
            const durationMs = await new Promise<number>((resolve) => {
              if (kindIsGif) {
                resolve(3000);
                return;
              }
              if (kindIsStill) {
                resolve(5000);
                return;
              }
              const vid = document.createElement("video");
              vid.preload = "metadata";
              vid.onloadedmetadata = () => {
                resolve(Math.round(vid.duration * 1000));
                URL.revokeObjectURL(vid.src);
              };
              vid.onerror = () => {
                resolve(0);
                URL.revokeObjectURL(vid.src);
              };
              vid.src = URL.createObjectURL(file);
            });
            if (durationMs <= 0) {
              alert("Could not read media duration.");
              return;
            }
            if (durationMs > 30_000) {
              alert("Clip too long. Max 30 seconds.");
              return;
            }
            uploadBumperMutation.mutate({
              file,
              title:
                bumperTitleDraft.trim() || file.name.replace(/\.[^.]+$/, ""),
              durationMs,
              category: bumperCategoryDraft,
            });
          }}
        >
          {uploadBumperMutation.isPending
            ? "UPLOADING..."
            : atLimit
              ? "LIMIT REACHED"
              : `UPLOAD ${bumperCategoryDraft.toUpperCase()}`}
        </MenuBtn>
      </MenuRow>
      {uploadBumperMutation.isError && (
        <MenuLabel style={{ color: "#ff6655", marginTop: 4 }}>
          {(uploadBumperMutation.error as Error)?.message || "Upload failed"}
        </MenuLabel>
      )}
      {updateBumperMutation.isError && (
        <MenuLabel style={{ color: "#ff6655", marginTop: 4 }}>
          {(updateBumperMutation.error as Error)?.message ||
            "Failed to update bumper visibility"}
        </MenuLabel>
      )}

      <MenuDivider />
      <MenuLabel>
        COMMUNITY BUMPER LIBRARY ({(communityBumpersQuery.data || []).length})
      </MenuLabel>
      <MenuScrollList>
        {(communityBumpersQuery.data || []).map((b) => (
          <MenuItem key={`community-${b.id}`}>
            <MenuRow>
              <span style={{ flex: 1 }}>{b.title}</span>
              <MenuLabel>{(b.durationMs / 1000).toFixed(1)}s</MenuLabel>
              <MenuLabel style={{ opacity: 0.8 }}>
                by {b.credit || "anon"}
              </MenuLabel>
            </MenuRow>
          </MenuItem>
        ))}
        {communityBumpersQuery.isLoading && (
          <MenuItem $disabled>Loading community bumpers…</MenuItem>
        )}
        {!communityBumpersQuery.isLoading &&
          (communityBumpersQuery.data || []).length === 0 && (
            <MenuItem $disabled>No community bumpers yet</MenuItem>
          )}
      </MenuScrollList>
    </MenuOverlay>
  );
}
