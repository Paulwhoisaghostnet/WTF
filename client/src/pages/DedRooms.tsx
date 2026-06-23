import { AppWindow } from "../components/layout/AppWindow";
import { DedRoomsApp } from "../features/dedrooms/DedRoomsApp";

export function DedRooms() {
  return (
    <AppWindow title="DedRooms">
      <DedRoomsApp />
    </AppWindow>
  );
}
