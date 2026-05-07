import UnifiedGallery from "@/components/UnifiedGallery";
import { WTF_PROFILE_GALLERY_ID } from "@/lib/wtf/profile-tokens";

export default function WtfProfileGalleryPage() {
    return (
        <UnifiedGallery
            address={WTF_PROFILE_GALLERY_ID}
            currentPage={1}
            isBasePage={true}
            enableDocumentTitle={true}
        />
    );
}
