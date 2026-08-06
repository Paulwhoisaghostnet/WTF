import { ColanderApp } from "../features/pasta-protocol/colander/ColanderApp";
import { usePastaFavicon } from "../features/pasta-protocol/pasta-favicon";

export function Colander() {
  usePastaFavicon("pasta-suite");
  return <ColanderApp />;
}

export default Colander;
