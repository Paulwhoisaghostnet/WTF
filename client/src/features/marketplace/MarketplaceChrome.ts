import styled from "styled-components";

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
`;

export const ListingCard = styled.div`
  background: #c0c0c0;
  border: 2px outset #dfdfdf;
  box-shadow: 1px 1px 0 #000;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  &:hover {
    box-shadow: 1px 1px 0 #000080;
  }
`;

export const ListingTitleBar = styled.div`
  background: linear-gradient(90deg, #000080, #1084d0);
  color: #fff;
  font-weight: bold;
  font-size: 11px;
  padding: 3px 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 20px;
`;

export const TokenImage = styled.div`
  width: 100%;
  min-height: 160px;
  max-height: 220px;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  border-top: 1px solid #808080;
  border-bottom: 1px solid #808080;

  img {
    max-width: 100%;
    max-height: 220px;
    object-fit: contain;
  }
`;

export const ListingBody = styled.div`
  padding: 6px 8px;
  font-size: 11px;
`;

export const ListingActions = styled.div`
  display: flex;
  gap: 4px;
  padding: 4px 8px 6px;
  flex-wrap: wrap;
  align-items: center;
  border-top: 1px solid #808080;
  margin-top: auto;
`;

export const Price = styled.div`
  font-size: 18px;
  font-weight: bold;
  color: #000080;
`;

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
`;

export const SelectedTokenPreview = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: #dfdfdf;
  border: 2px inset #808080;
  margin-bottom: 8px;

  img {
    width: 64px;
    height: 64px;
    object-fit: contain;
    border: 1px solid #808080;
  }
`;
