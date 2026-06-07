import type { Dispatch, ReactElement, SetStateAction } from "react";
import {
  TextInput,
  Table,
  TableHead,
  TableRow,
  TableHeadCell,
  TableDataCell,
  TableBody,
} from "react95";
import styled from "styled-components";
import { UiButton, UiPanel } from "../../../components/wtfos-ui";
import type { EntityUpdatePayload } from "../types";

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--wtf-space-1, 4px);
  margin-bottom: var(--wtf-space-2, 8px);

  label {
    color: var(--wtf-app-text, #111);
    font-size: var(--wtf-type-caption, 13px);
    font-weight: 700;
    line-height: 1.3;
  }
`;

const ActionRow = styled.div`
  display: flex;
  gap: var(--wtf-space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
`;

const TableWrap = styled.div`
  min-width: 0;
  overflow-x: auto;
`;

const PanelStack = styled.div`
  display: grid;
  gap: var(--wtf-space-3, 12px);
  margin-top: var(--wtf-space-3, 12px);
`;

const TruncateText = styled.span`
  display: block;
  max-width: 240px;
  overflow: hidden;
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
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
        <UiButton
          onClick={() => setContentSubTab("links")}
          active={contentSubTab === "links"}
          uiVariant={contentSubTab === "links" ? "primary" : "quiet"}
        >
          Manage links
        </UiButton>
        <UiButton
          onClick={() => setContentSubTab("faq")}
          active={contentSubTab === "faq"}
          uiVariant={contentSubTab === "faq" ? "primary" : "quiet"}
        >
          Manage FAQ
        </UiButton>
      </ActionRow>

      {contentSubTab === "links" && (
        <>
          <TableWrap>
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
                    <TableDataCell>
                      <TruncateText>{lnk.url}</TruncateText>
                    </TableDataCell>
                    <TableDataCell>{lnk.category || "---"}</TableDataCell>
                    <TableDataCell>
                      <ActionRow>
                        <UiButton
                          compact
                          onClick={() =>
                            setEditingLink(
                              editingLink?.id === lnk.id
                                ? null
                                : { ...lnk, displayOrder: String(lnk.displayOrder || 0), description: lnk.description || "", category: lnk.category || "" }
                            )
                          }
                        >
                          {editingLink?.id === lnk.id ? "Cancel link edit" : "Edit link"}
                        </UiButton>
                        <ConfirmButton
                          label="Delete link"
                          confirmLabel="Confirm delete"
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
          </TableWrap>

          <PanelStack>
          {editingLink && (
            <UiPanel title={`Edit link: ${editingLink.title}`} compact>
              <Field>
                <label>Title</label>
                <TextInput aria-label="Edit link title" value={editingLink.title} onChange={(e: any) => setEditingLink((p: any) => ({ ...p, title: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>URL</label>
                <TextInput aria-label="Edit link URL" value={editingLink.url} onChange={(e: any) => setEditingLink((p: any) => ({ ...p, url: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Description</label>
                <TextInput aria-label="Edit link description" value={editingLink.description} onChange={(e: any) => setEditingLink((p: any) => ({ ...p, description: e.target.value }))} multiline fullWidth />
              </Field>
              <Field>
                <label>Category</label>
                <TextInput aria-label="Edit link category" value={editingLink.category} onChange={(e: any) => setEditingLink((p: any) => ({ ...p, category: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Display Order</label>
                <TextInput aria-label="Edit link display order" value={editingLink.displayOrder} onChange={(e: any) => setEditingLink((p: any) => ({ ...p, displayOrder: e.target.value }))} fullWidth />
              </Field>
              <UiButton
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
                Save link changes
              </UiButton>
            </UiPanel>
          )}

          <UiPanel title="New link" compact>
            <Field>
              <label>Title</label>
              <TextInput aria-label="New link title" value={linkForm.title} onChange={(e: any) => setLinkForm((f) => ({ ...f, title: e.target.value }))} fullWidth />
            </Field>
            <Field>
              <label>URL</label>
              <TextInput aria-label="New link URL" value={linkForm.url} onChange={(e: any) => setLinkForm((f) => ({ ...f, url: e.target.value }))} fullWidth />
            </Field>
            <Field>
              <label>Description</label>
              <TextInput aria-label="New link description" value={linkForm.description} onChange={(e: any) => setLinkForm((f) => ({ ...f, description: e.target.value }))} multiline fullWidth />
            </Field>
            <Field>
              <label>Category</label>
              <TextInput aria-label="New link category" value={linkForm.category} onChange={(e: any) => setLinkForm((f) => ({ ...f, category: e.target.value }))} fullWidth />
            </Field>
            <Field>
              <label>Display Order</label>
              <TextInput aria-label="New link display order" value={linkForm.displayOrder} onChange={(e: any) => setLinkForm((f) => ({ ...f, displayOrder: e.target.value }))} fullWidth />
            </Field>
            <UiButton
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
              Create link
            </UiButton>
          </UiPanel>
          </PanelStack>
        </>
      )}

      {contentSubTab === "faq" && (
        <>
          <TableWrap>
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
                  <TableDataCell>
                    <TruncateText>{faq.question}</TruncateText>
                  </TableDataCell>
                  <TableDataCell>{faq.category || "---"}</TableDataCell>
                  <TableDataCell>
                    <ActionRow>
                      <UiButton
                        compact
                        onClick={() =>
                          setEditingFaq(
                            editingFaq?.id === faq.id
                              ? null
                              : { ...faq, displayOrder: String(faq.displayOrder || 0), category: faq.category || "" }
                          )
                        }
                      >
                        {editingFaq?.id === faq.id ? "Cancel FAQ edit" : "Edit FAQ"}
                      </UiButton>
                      <ConfirmButton
                        label="Delete FAQ"
                        confirmLabel="Confirm delete"
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
          </TableWrap>

          <PanelStack>
          {editingFaq && (
            <UiPanel title="Edit FAQ" compact>
              <Field>
                <label>Question</label>
                <TextInput aria-label="Edit FAQ question" value={editingFaq.question} onChange={(e: any) => setEditingFaq((p: any) => ({ ...p, question: e.target.value }))} multiline fullWidth />
              </Field>
              <Field>
                <label>Answer</label>
                <TextInput aria-label="Edit FAQ answer" value={editingFaq.answer} onChange={(e: any) => setEditingFaq((p: any) => ({ ...p, answer: e.target.value }))} multiline fullWidth />
              </Field>
              <Field>
                <label>Category</label>
                <TextInput aria-label="Edit FAQ category" value={editingFaq.category} onChange={(e: any) => setEditingFaq((p: any) => ({ ...p, category: e.target.value }))} fullWidth />
              </Field>
              <Field>
                <label>Display Order</label>
                <TextInput aria-label="Edit FAQ display order" value={editingFaq.displayOrder} onChange={(e: any) => setEditingFaq((p: any) => ({ ...p, displayOrder: e.target.value }))} fullWidth />
              </Field>
              <UiButton
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
                Save FAQ changes
              </UiButton>
            </UiPanel>
          )}

          <UiPanel title="New FAQ item" compact>
            <Field>
              <label>Question</label>
              <TextInput aria-label="New FAQ question" value={faqForm.question} onChange={(e: any) => setFaqForm((f) => ({ ...f, question: e.target.value }))} multiline fullWidth />
            </Field>
            <Field>
              <label>Answer</label>
              <TextInput aria-label="New FAQ answer" value={faqForm.answer} onChange={(e: any) => setFaqForm((f) => ({ ...f, answer: e.target.value }))} multiline fullWidth />
            </Field>
            <Field>
              <label>Category</label>
              <TextInput aria-label="New FAQ category" value={faqForm.category} onChange={(e: any) => setFaqForm((f) => ({ ...f, category: e.target.value }))} fullWidth />
            </Field>
            <Field>
              <label>Display Order</label>
              <TextInput aria-label="New FAQ display order" value={faqForm.displayOrder} onChange={(e: any) => setFaqForm((f) => ({ ...f, displayOrder: e.target.value }))} fullWidth />
            </Field>
            <UiButton
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
              Create FAQ item
            </UiButton>
          </UiPanel>
          </PanelStack>
        </>
      )}
    </>
  );
}
