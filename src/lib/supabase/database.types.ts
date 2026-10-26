export type ProfessionalStatus = "draft" | "pending" | "approved" | "rejected" | "suspended";

export type PublicProfessional = {
  id: string;
  slug: string;
  business_name: string;
  description: string;
  whatsapp_phone: string | null;
  city: string;
  service_area: string;
  updated_at: string;
  category_slugs: string[];
};

export type OwnProfessional = PublicProfessional & {
  status: ProfessionalStatus;
  is_published: boolean;
};

export type AdminProfessional = OwnProfessional & {
  last_moderation_reason: string | null;
  last_moderated_at: string | null;
  has_more: boolean;
};

export type AdminProfessionalImage = { professional_id: string; id: string; object_path: string; image_kind: "profile" | "portfolio"; mime_type: string; size_bytes: number; width: number; height: number; created_at: string };

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        { id: string; display_name: string; phone: string | null; city: string; created_at: string; updated_at: string },
        { id: string; display_name?: string; phone?: string | null; city?: string }
      >;
      professionals: Table<
        { id: string; user_id: string; slug: string; business_name: string; description: string; whatsapp_phone: string | null; city: string; service_area: string; status: ProfessionalStatus; is_published: boolean; created_at: string; updated_at: string },
        { id?: string; user_id: string; slug: string; business_name: string; description: string; whatsapp_phone?: string | null; city?: string; service_area: string; status?: ProfessionalStatus; is_published?: boolean }
      >;
      categories: Table<
        { id: string; name: string; slug: string; description: string | null; is_active: boolean; created_at: string; updated_at: string },
        { id?: string; name: string; slug: string; description?: string | null; is_active?: boolean }
      >;
      professional_categories: Table<
        { professional_id: string; category_id: string; created_at: string },
        { professional_id: string; category_id: string }
      >;
    };
    Views: {
      public_professionals: { Row: PublicProfessional; Relationships: [] };
    };
    Functions: {
      search_public_professionals: { Args: { p_query?: string | null; p_city?: string | null; p_category_slug?: string | null }; Returns: PublicProfessional[] };
      search_public_professionals_page: { Args: { p_query?: string | null; p_city?: string | null; p_category_slug?: string | null; p_limit?: number; p_offset?: number; p_sort?: string }; Returns: (PublicProfessional & { has_more: boolean })[] };
      get_public_professional: { Args: { p_slug: string }; Returns: PublicProfessional[] };
      get_own_professional_profile: { Args: Record<string, never>; Returns: OwnProfessional[] };
      submit_own_professional_profile: { Args: { p_slug: string; p_business_name: string; p_description: string; p_whatsapp_phone: string | null; p_city: string; p_service_area: string; p_category_slugs: string[] }; Returns: string };
      is_current_user_admin: { Args: Record<string, never>; Returns: boolean };
      get_admin_professionals: { Args: { p_status?: string; p_limit?: number; p_offset?: number }; Returns: AdminProfessional[] };
      moderate_professional: { Args: { p_professional_id: string; p_action: string; p_reason: string | null; p_expected_status: string; p_expected_is_published: boolean }; Returns: { slug: string; status: ProfessionalStatus; is_published: boolean; updated_at: string }[] };
      reserve_professional_image: { Args: { p_professional_id: string; p_kind: string; p_mime_type: string; p_extension: string; p_size_bytes: number; p_width: number; p_height: number }; Returns: { image_id: string; object_path: string }[] };
      mark_professional_image_uploaded: { Args: { p_image_id: string; p_mime_type: string; p_extension: string; p_size_bytes: number; p_width: number; p_height: number }; Returns: undefined };
      cancel_professional_image_upload: { Args: { p_image_id: string }; Returns: undefined };
      begin_professional_image_delete: { Args: { p_image_id: string }; Returns: string };
      begin_professional_image_delete_paths: { Args: { p_image_id: string }; Returns: { object_path: string; upload_path: string | null }[] };
      finish_professional_image_delete: { Args: { p_image_id: string }; Returns: undefined };
      get_own_professional_images: { Args: Record<string, never>; Returns: { id: string; professional_id: string; object_path: string | null; upload_path: string | null; image_kind: string; mime_type: string; size_bytes: number; width: number; height: number; state: string; created_at: string }[] };
      get_professional_image_upload: { Args: { p_image_id: string }; Returns: { id: string; object_path: string; upload_path: string | null; image_kind: string; mime_type: string; extension: string; size_bytes: number; state: string }[] };
      clear_professional_image_upload_path: { Args: { p_image_id: string }; Returns: undefined };
      get_professional_image: { Args: { p_image_id: string }; Returns: { object_path: string; mime_type: string; size_bytes: number }[] };
      mark_professional_image_cleanup_pending: { Args: { p_image_id: string }; Returns: undefined };
      get_admin_professional_images: { Args: { p_professional_ids: string[] }; Returns: AdminProfessionalImage[] };
      get_public_professional_images: { Args: { p_slug: string }; Returns: { id: string; object_path: string; image_kind: "profile" | "portfolio"; mime_type: string; width: number; height: number }[] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
