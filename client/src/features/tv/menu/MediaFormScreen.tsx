import type { Dispatch, ReactElement, SetStateAction } from "react";
import { MenuBtn, MenuLabel, MenuOverlay, MenuTitle } from "../TVChrome";
import type { ScreenView } from "../types";

type MediaFormScreenProps = {
  renderBackBtn: (label?: string) => ReactElement;
  setScreenView: Dispatch<SetStateAction<ScreenView>>;
};

export function MediaFormScreen({
  renderBackBtn,
  setScreenView,
}: MediaFormScreenProps) {
  return (
    <MenuOverlay>
      <MenuTitle>
        <span>ADD MEDIA</span>
        {renderBackBtn("MY MEDIA")}
      </MenuTitle>
      <MenuLabel style={{ marginBottom: 8 }}>
        Media is now managed through the centralized Media Library. Open "My
        Videos" from the Start Menu to import tokens or upload files.
      </MenuLabel>
      <MenuBtn $accent onClick={() => setScreenView("my-media")}>
        BACK TO MY MEDIA
      </MenuBtn>
    </MenuOverlay>
  );
}
