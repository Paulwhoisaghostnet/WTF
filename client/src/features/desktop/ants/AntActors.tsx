import styled from "styled-components";
import { ANT_SIZE } from "./model";

export const PheromoneDot = styled.span<{ $x: number; $y: number; $age: number }>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(173, 255, 47, ${(p) => Math.max(0, 0.25 * (1 - p.$age))});
  box-shadow: 0 0 4px rgba(202, 255, 79, ${(p) => Math.max(0, 0.16 * (1 - p.$age))});
  pointer-events: none;
  z-index: 0;
`;

export const AntActor = styled.span<{
  $x: number;
  $y: number;
  $angle: number;
  $dancing: boolean;
  $carrying: boolean;
}>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: ${ANT_SIZE}px;
  height: 8px;
  transform: translate(-50%, -50%) rotate(${(p) => p.$angle}rad);
  transform-origin: center;
  pointer-events: none;
  z-index: 1;
  animation: ${(p) => (p.$dancing ? "ant-dance 520ms steps(2, end) infinite" : "none")};

  &::before {
    content: "";
    position: absolute;
    left: 1px;
    top: 2px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #16120f;
    box-shadow: 4px 0 0 #211915, 8px 0 0 #16120f;
  }

  &::after {
    content: "";
    position: absolute;
    left: 1px;
    top: 0;
    width: 2px;
    height: 2px;
    background: #16120f;
    box-shadow:
      2px 7px 0 #16120f,
      5px 0 0 #16120f,
      6px 7px 0 #16120f,
      9px 0 0 #16120f,
      10px 7px 0 #16120f;
  }

  span {
    display: ${(p) => (p.$carrying ? "block" : "none")};
    position: absolute;
    right: -3px;
    top: -1px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #c68d43;
    box-shadow: inset -1px -1px 0 rgba(68, 34, 12, 0.45);
  }

  @keyframes ant-dance {
    0% {
      margin-left: -2px;
      margin-top: 1px;
    }
    50% {
      margin-left: 2px;
      margin-top: -1px;
    }
    100% {
      margin-left: -2px;
      margin-top: 1px;
    }
  }
`;
