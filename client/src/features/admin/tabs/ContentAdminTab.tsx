import type { Dispatch, ReactElement, SetStateAction } from "react";
import {
  Button,
  GroupBox,
  TextInput,
  Table,
  TableHead,
  TableRow,
  TableHeadCell,
  TableDataCell,
  TableBody,
} from "react95";
import styled from "styled-components";
import type { EntityUpdatePayload } from "../types";

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

type ContentSubTab = "links" | "faq";

type LinkForm = {
  title: string;
  url: string;
  description: string;
  category: string;
  displayOrder: string;
};

type FaqForm = {
  question: string;
  answer: string;
  category: string;
  displayOrder: string;
};

type AdminMutation<TPayload> = {
  mutate: (payload: TPayload) => void;
  isPending: boolean;
};

type ContentAdminTabProps = {
  contentSubTab: ContentSubTab;
  setContentSubTab: Dispatch<SetStateAction<ContentSubTab>>;
  allLinks: any[] | undefined;
  allFaq: any[] | undefined;
  linkForm: LinkForm;
  setLinkForm: Dispatch<SetStateAction<LinkForm>>;
  editingLink: any;
  setEditingLink: Dispatch<SetStateAction<any>>;
  faqForm: FaqForm;
  setFaqForm: Dispatch<SetStateAction<FaqForm>>;
  editingFaq: any;
  setEditingFaq: Dispatch<SetStateAction<any>>;
  createLinkMutation: AdminMutation<Record<string, any>>;
  updateLinkMutation: AdminMutation<EntityUpdatePayload>;
  deleteLinkMutation: AdminMutation<number>;
  createFaqMutation: AdminMutation<Record<string, any>>;
  updateFaqMutation: AdminMutation<EntityUpdatePayload>;
  deleteFaqMutation: AdminMutation<number>;
  ConfirmButton: (props: {
    label: string;
    confirmLabel?: string;
    onConfirm: () => void;
    disabled?: boolean;
    size?: "sm" | "lg";
  }) => ReactElement;
};

export function ContentAdminTab({
  contentSubTab,
  setContentSubTab,
  allLinks,
  allFaq,
  linkForm,
  setLinkForm,
  editingLink,
  setEditingLink,
  faqForm,
  setFaqForm,
  editingFaq,
  setEditingFaq,
  createLinkMutation,
  updateLinkMutation,
  deleteLinkMutation,
  createFaqMutation,
  updateFaqMutation,
  deleteFaqMutation,
  ConfirmButton,
}: ContentAdminTabProps) {
  return (
    <>
      <h3>Content Management</h3>
      <ActionRow style={{ marginBottom: 12 }}>
        <Button onClick={() => setContentSubTab("links")} active={contentSubTab === "links"}>
          Links
        </Button>
        <Button onClick={() => setContentSubTab("faq")} active={contentSubTab === "faq"}>
          FAQ
        </Button>
      </ActionRow>

      {contentSubTab === "links" && (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>Order</TableHeadCell>
                <TableHeadCell>Title</TableHeadCell>
                <TableHeadCell>URL</TableHeadCell>
                <TableHeadCell>Category</TableHeadCell>
                <TableHeadCell>Actions</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(allLinks || []).map((lnk: any) => (
                <TableRow key={lnk.id}>
                  <TableDataCell>{lnk.displayOrder}</TableDataCell>
                  <TableDataCell>{lnk.title}</TableDataCell>
                  <TableDataCell style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {lnk.url}
                  </TableDataCell>
                  <TableDataCell>{lnk.category || "---"}</TableDataCell>
                  <TableDataCell>
                    <ActionRow>
                      <Button
                        size="sm"
                        onClick={() =>
                          setEditingLink(
                            editingLink?.id === lnk.id
                              ? null
                              : { ...lnk, displayOrder: String(lnk.displayOrder || 0), description: lnk.description || "", category: lnk.category || "" }
                          )
                        }
                      >
                        {editingLink?.id === lnk.id ? "Cancel" : "Edit"}
                      </Button>
                      <ConfirmButton
                        label="Delete"
                        confirmLabel="Confirm"
                        onConfirm={() => deleteLinkMutation.mutate(lnk.id)}
                        disabled={deleteLinkMutation.isPending}
                      />
                    </ActionRow>
                  </TableDataCell>
                </TableRow>
              ))}
              {(!allLinks || allLinks.length === 0) && (
                <TableRow>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>No links yet.</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {editingLink && (
            <GroupBox label={`Edit: ${editingLink.title}`} style={{ marginTop: 12 }}>
              <Field>
                <label>Title</label>
                <TextInput value={editingLink.title} onChange={(e: any) => setEditingLink((p: any) => ({ ...p, title: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>URL</label>
                <TextInput value={editingLink.url} onChange={(e: any) => setEditingLink((p: any) => ({ ...p, url: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Description</label>
                <TextInput value={editingLink.description} onChange={(e: any) => setEditingLink((p: any) => ({ ...p, description: e.target.value }))} multiline fullWidth />
              </Field>
              <Field>
                <label>Category</label>
                <TextInput value={editingLink.category} onChange={(e: any) => setEditingLink((p: any) => ({ ...p, category: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Display Order</label>
                <TextInput value={editingLink.displayOrder} onChange={(e: any) => setEditingLink((p: any) => ({ ...p, displayOrder: e.target.value }))} fullWidth />
              </Field>
              <Button
                onClick={() =>
                  updateLinkMutation.mutate({
                    id: editingLink.id,
                    data: {
                      title: editingLink.title,
                      url: editingLink.url,
                      description: editingLink.description,
                      category: editingLink.category || null,
                      displayOrder: parseInt(editingLink.displayOrder) || 0,
                    },
                  })
                }
                disabled={updateLinkMutation.isPending}
              >
                Save Changes
              </Button>
            </GroupBox>
          )}

          <GroupBox label="New Link" style={{ marginTop: 12 }}>
            <Field>
              <label>Title</label>
              <TextInput value={linkForm.title} onChange={(e: any) => setLinkForm((f) => ({ ...f, title: e.target.value }))} fullWidth />
            </Field>
            <Field>
              <label>URL</label>
              <TextInput value={linkForm.url} onChange={(e: any) => setLinkForm((f) => ({ ...f, url: e.target.value }))} fullWidth />
            </Field>
            <Field>
              <label>Description</label>
              <TextInput value={linkForm.description} onChange={(e: any) => setLinkForm((f) => ({ ...f, description: e.target.value }))} multiline fullWidth />
            </Field>
            <Field>
              <label>Category</label>
              <TextInput value={linkForm.category} onChange={(e: any) => setLinkForm((f) => ({ ...f, category: e.target.value }))} fullWidth />
            </Field>
            <Field>
              <label>Display Order</label>
              <TextInput value={linkForm.displayOrder} onChange={(e: any) => setLinkForm((f) => ({ ...f, displayOrder: e.target.value }))} fullWidth />
            </Field>
            <Button
              onClick={() =>
                createLinkMutation.mutate({
                  title: linkForm.title,
                  url: linkForm.url,
                  description: linkForm.description,
                  category: linkForm.category || null,
                  displayOrder: parseInt(linkForm.displayOrder) || 0,
                })
              }
              disabled={createLinkMutation.isPending}
            >
              Create Link
            </Button>
          </GroupBox>
        </>
      )}

      {contentSubTab === "faq" && (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>Order</TableHeadCell>
                <TableHeadCell>Question</TableHeadCell>
                <TableHeadCell>Category</TableHeadCell>
                <TableHeadCell>Actions</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(allFaq || []).map((faq: any) => (
                <TableRow key={faq.id}>
                  <TableDataCell>{faq.displayOrder}</TableDataCell>
                  <TableDataCell style={{ maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {faq.question}
                  </TableDataCell>
                  <TableDataCell>{faq.category || "---"}</TableDataCell>
                  <TableDataCell>
                    <ActionRow>
                      <Button
                        size="sm"
                        onClick={() =>
                          setEditingFaq(
                            editingFaq?.id === faq.id
                              ? null
                              : { ...faq, displayOrder: String(faq.displayOrder || 0), category: faq.category || "" }
                          )
                        }
                      >
                        {editingFaq?.id === faq.id ? "Cancel" : "Edit"}
                      </Button>
                      <ConfirmButton
                        label="Delete"
                        confirmLabel="Confirm"
                        onConfirm={() => deleteFaqMutation.mutate(faq.id)}
                        disabled={deleteFaqMutation.isPending}
                      />
                    </ActionRow>
                  </TableDataCell>
                </TableRow>
              ))}
              {(!allFaq || allFaq.length === 0) && (
                <TableRow>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>No FAQ items yet.</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                  <TableDataCell>---</TableDataCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {editingFaq && (
            <GroupBox label="Edit FAQ" style={{ marginTop: 12 }}>
              <Field>
                <label>Question</label>
                <TextInput value={editingFaq.question} onChange={(e: any) => setEditingFaq((p: any) => ({ ...p, question: e.target.value }))} multiline fullWidth />
              </Field>
              <Field>
                <label>Answer</label>
                <TextInput value={editingFaq.answer} onChange={(e: any) => setEditingFaq((p: any) => ({ ...p, answer: e.target.value }))} multiline fullWidth />
              </Field>
              <Field>
                <label>Category</label>
                <TextInput value={editingFaq.category} onChange={(e: any) => setEditingFaq((p: any) => ({ ...p, category: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Display Order</label>
                <TextInput value={editingFaq.displayOrder} onChange={(e: any) => setEditingFaq((p: any) => ({ ...p, displayOrder: e.target.value }))} fullWidth />
              </Field>
              <Button
                onClick={() =>
                  updateFaqMutation.mutate({
                    id: editingFaq.id,
                    data: {
                      question: editingFaq.question,
                      answer: editingFaq.answer,
                      category: editingFaq.category || null,
                      displayOrder: parseInt(editingFaq.displayOrder) || 0,
                    },
                  })
                }
                disabled={updateFaqMutation.isPending}
              >
                Save Changes
              </Button>
            </GroupBox>
          )}

          <GroupBox label="New FAQ Item" style={{ marginTop: 12 }}>
            <Field>
              <label>Question</label>
              <TextInput value={faqForm.question} onChange={(e: any) => setFaqForm((f) => ({ ...f, question: e.target.value }))} multiline fullWidth />
            </Field>
            <Field>
              <label>Answer</label>
              <TextInput value={faqForm.answer} onChange={(e: any) => setFaqForm((f) => ({ ...f, answer: e.target.value }))} multiline fullWidth />
            </Field>
            <Field>
              <label>Category</label>
              <TextInput value={faqForm.category} onChange={(e: any) => setFaqForm((f) => ({ ...f, category: e.target.value }))} fullWidth />
            </Field>
            <Field>
              <label>Display Order</label>
              <TextInput value={faqForm.displayOrder} onChange={(e: any) => setFaqForm((f) => ({ ...f, displayOrder: e.target.value }))} fullWidth />
            </Field>
            <Button
              onClick={() =>
                createFaqMutation.mutate({
                  question: faqForm.question,
                  answer: faqForm.answer,
                  category: faqForm.category || null,
                  displayOrder: parseInt(faqForm.displayOrder) || 0,
                })
              }
              disabled={createFaqMutation.isPending}
            >
              Create FAQ Item
            </Button>
          </GroupBox>
        </>
      )}
    </>
  );
}
