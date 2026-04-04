import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  TextInput,
  Select,
  Hourglass,
  Separator,
  Tabs,
  Tab,
  TabBody,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import { formatWtf } from "@shared/types";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
`;

const ListingCard = styled(GroupBox)`
  position: relative;
`;

const TokenImage = styled.div`
  width: 100%;
  height: 120px;
  background: #c0c0c0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  border: 1px solid #808080;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
`;

const Price = styled.div`
  font-size: 18px;
  font-weight: bold;
  color: #000080;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
`;

export function Marketplace() {
  const { user, canParticipate } = useAuth();
  const qc = useQueryClient();
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    tokenContract: "",
    tokenId: "0",
    tokenName: "",
    amount: "1",
    listingType: "buy_now",
    priceWtf: "",
    minBidWtf: "",
    endTime: "",
  });

  const { data: listings, isLoading } = useQuery({
    queryKey: ["marketplace", "active"],
    queryFn: () => api.get<any[]>("/api/marketplace?status=active"),
  });

  const { data: myListings, isLoading: loadingMine } = useQuery({
    queryKey: ["marketplace", "mine", user?.id],
    queryFn: () => api.get<any[]>("/api/marketplace/mine"),
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post("/api/marketplace", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketplace"] });
      setShowCreate(false);
      setErrorMsg("");
      setCreateForm({
        tokenContract: "",
        tokenId: "0",
        tokenName: "",
        amount: "1",
        listingType: "buy_now",
        priceWtf: "",
        minBidWtf: "",
        endTime: "",
      });
    },
    onError: (err: any) => {
      setErrorMsg(err?.message || "Failed to create listing");
    },
  });

  const updateField = (field: string) => (e: any) =>
    setCreateForm((f) => ({ ...f, [field]: e.target?.value ?? e.value }));

  return (
    <AppWindow title="WTF Marketplace">
      <Tabs value={activeTab} onChange={(v: number) => setActiveTab(v)}>
        <Tab value={0}>Browse</Tab>
        <Tab value={1}>My Listings</Tab>
      </Tabs>

      <TabBody>
        {activeTab === 0 && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <span>{listings?.length || 0} active listings</span>
              {canParticipate && (
                <Button onClick={() => setShowCreate(!showCreate)}>
                  {showCreate ? "Cancel" : "+ New Listing"}
                </Button>
              )}
            </div>

            {showCreate && (
              <GroupBox label="Create Listing" style={{ marginBottom: 12 }}>
                <Field>
                  <label>Token Contract Address</label>
                  <TextInput
                    value={createForm.tokenContract}
                    onChange={updateField("tokenContract")}
                    placeholder="KT1..."
                    fullWidth
                  />
                </Field>
                <Field>
                  <label>Token ID</label>
                  <TextInput
                    value={createForm.tokenId}
                    onChange={updateField("tokenId")}
                    fullWidth
                  />
                </Field>
                <Field>
                  <label>Token Name</label>
                  <TextInput
                    value={createForm.tokenName}
                    onChange={updateField("tokenName")}
                    placeholder="My NFT"
                    fullWidth
                  />
                </Field>
                <Field>
                  <label>Listing Type</label>
                  <Select
                    value={createForm.listingType}
                    onChange={(e: any) =>
                      setCreateForm((f) => ({
                        ...f,
                        listingType: e.value,
                      }))
                    }
                    options={[
                      { label: "Buy Now", value: "buy_now" },
                      { label: "Auction", value: "auction" },
                    ]}
                    width={200}
                  />
                </Field>
                <Field>
                  <label>Price (WTF)</label>
                  <TextInput
                    value={createForm.priceWtf}
                    onChange={updateField("priceWtf")}
                    placeholder="100"
                    fullWidth
                  />
                </Field>
                {createForm.listingType === "auction" && (
                  <>
                    <Field>
                      <label>Minimum Bid (WTF)</label>
                      <TextInput
                        value={createForm.minBidWtf}
                        onChange={updateField("minBidWtf")}
                        placeholder="100"
                        fullWidth
                      />
                    </Field>
                    <Field>
                      <label>Auction End Time</label>
                      <TextInput
                        value={createForm.endTime}
                        onChange={updateField("endTime")}
                        placeholder="2026-12-31T23:59:59.000Z"
                        fullWidth
                      />
                    </Field>
                  </>
                )}
                {errorMsg && (
                  <p style={{ color: "red", fontSize: 12, margin: "6px 0" }}>
                    {errorMsg}
                  </p>
                )}
                <Button
                  onClick={() =>
                    createMutation.mutate({
                      tokenContract: createForm.tokenContract,
                      tokenId: parseInt(createForm.tokenId),
                      tokenName: createForm.tokenName,
                      amount: parseInt(createForm.amount),
                      listingType: createForm.listingType,
                      priceWtf: parseInt(createForm.priceWtf),
                      minBidWtf: createForm.minBidWtf
                        ? parseInt(createForm.minBidWtf)
                        : null,
                      endTime: createForm.endTime || null,
                    })
                  }
                  disabled={createMutation.isPending}
                >
                  Create Listing
                </Button>
              </GroupBox>
            )}

            {isLoading ? (
              <Hourglass size={32} />
            ) : (
              <Grid>
                {listings?.map((l: any) => (
                  <ListingCard key={l.id} label={l.tokenName || `Token #${l.tokenId}`}>
                    <TokenImage>
                      {l.tokenThumbnail ? (
                        <img src={l.tokenThumbnail} alt={l.tokenName} />
                      ) : (
                        <span>No Preview</span>
                      )}
                    </TokenImage>
                    <Price>{l.priceWtf} WTF</Price>
                    <p style={{ fontSize: 11 }}>
                      {l.listingType === "auction" ? "Auction" : "Buy Now"} by{" "}
                      {l.sellerDisplayName || l.sellerUsername}
                    </p>
                    <p style={{ fontSize: 10, fontFamily: "monospace" }}>
                      {l.tokenContract}
                    </p>
                    {canParticipate &&
                      l.sellerUserId !== user?.id &&
                      l.listingType === "buy_now" && (
                        <Button size="sm" fullWidth style={{ marginTop: 4 }}>
                          Buy Now
                        </Button>
                      )}
                  </ListingCard>
                ))}
                {(!listings || listings.length === 0) && (
                  <p>No active listings.</p>
                )}
              </Grid>
            )}
          </>
        )}

        {activeTab === 1 &&
          (loadingMine ? (
            <Hourglass size={32} />
          ) : (
            <Grid>
              {myListings?.map((l: any) => (
                <ListingCard key={l.id} label={l.tokenName || `Token #${l.tokenId}`}>
                  <Price>{l.priceWtf} WTF</Price>
                  <p style={{ fontSize: 11 }}>
                    {l.listingType === "auction" ? "Auction" : "Buy Now"} |{" "}
                    {l.status}
                  </p>
                  <p style={{ fontSize: 10, fontFamily: "monospace" }}>
                    {l.tokenContract}
                  </p>
                  <p style={{ fontSize: 10 }}>
                    Amount: {l.amount} | Token ID: {l.tokenId}
                  </p>
                  {l.endTime && (
                    <p style={{ fontSize: 10 }}>
                      Ends: {new Date(l.endTime).toLocaleString()}
                    </p>
                  )}
                </ListingCard>
              ))}
              {(!myListings || myListings.length === 0) && (
                <p>You have no listings yet.</p>
              )}
            </Grid>
          ))}
      </TabBody>
    </AppWindow>
  );
}
