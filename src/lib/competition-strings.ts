import type { NoticeLanguage } from "@/lib/notice/config";

/**
 * 신청 폼에서 **시스템이 넣는 문구**의 언어별 사전.
 *
 * 운영자가 쓴 글(항목 이름·안내·동의 문구)은 여기 없다 — 여기 있는 건 우리가 대신 써 주는
 * 것뿐이다: 파일 크기 안내, 유튜브 공개 설정 안내, 버튼, 오류 메시지.
 *
 * 왜 필요했나: 항목 이름은 영어로 바꿀 수 있는데 그 밑에 붙는 안내는 한글로 굳어 있어서,
 * 영문 폼에 "Team image" 아래 "장당 4MB 이하, 최대 3장" 이 나왔다. 운영자가 손댈 수 없는
 * 자리라 더 답답한 종류다(공고에서 겪은 것과 같은 문제).
 */
export interface CompetitionFormStrings {
  required: string;
  choosePlaceholder: string;
  /**
   * 파일 선택 버튼 — 브라우저 기본 `<input type="file">` 의 "파일 선택/Choose File" 라벨은
   * 페이지 언어가 아니라 **브라우저 UI 언어**를 따라서, 폼을 영문으로 바꿔도 이 버튼만
   * 한글로 남는다(운영자가 못 고친다). 그래서 네이티브 버튼을 숨기고 이 문구로 직접 그린다.
   */
  chooseFile: string;
  /** 이미지 항목 아래 안내. {max} 를 장수로 바꿔 쓴다. */
  imageHint: (max: number) => string;
  youtubeHint: string;
  modalTitle: string;
  submit: string;
  submitting: string;
  close: string;
  consent: string;
  terms: string;
  agreeRequired: string;
  submitted: string;
  submitFailed: string;
  networkError: string;
  uploadFailed: string;
  uploadNetworkError: string;
  previewBanner: string;
  previewSubmitted: string;
  /** 접수 완료 문구에 붙는 참가번호 라벨 */
  entryNoLabel: string;
  notAcceptingNow: string;
  /** 필수 항목 미입력. {label} 을 항목 이름으로 채워 쓴다. */
  fieldRequired: (label: string) => string;
  /** 전화 형식 오류. {label} 을 항목 이름으로 채워 쓴다. */
  phoneInvalid: (label: string) => string;
  youtubeInvalid: string;
  busy: string;
  duplicateEntry: string;
}

const KO: CompetitionFormStrings = {
  required: " (필수)",
  choosePlaceholder: "선택해주세요",
  chooseFile: "파일 선택",
  imageHint: (max) => `장당 4MB 이하, 최대 ${max}장`,
  youtubeHint: "비공개(Private) 영상은 심사·투표 화면에서 재생되지 않아요. 미등록(Unlisted) 또는 공개로 설정해주세요.",
  modalTitle: "참가 신청",
  submit: "신청서 제출",
  submitting: "제출 중...",
  close: "닫기",
  consent: "동의",
  terms: "약관",
  agreeRequired: "개인정보 수집 및 이용에 동의해주세요.",
  submitted: "신청이 접수되었어요.",
  submitFailed: "접수에 실패했어요. 잠시 후 다시 시도해주세요.",
  networkError: "네트워크 오류가 발생했어요.",
  uploadFailed: "업로드에 실패했어요.",
  uploadNetworkError: "업로드 중 네트워크 오류가 발생했어요.",
  previewBanner: "미리보기입니다. 신청해도 저장되지 않아요.",
  previewSubmitted: "미리보기라 저장되지 않았어요. 실제 배포 후에는 정상 접수됩니다.",
  entryNoLabel: "참가번호",
  notAcceptingNow: "지금은 접수 기간이 아니에요.",
  fieldRequired: (label) => `${label} 항목을 입력해주세요.`,
  phoneInvalid: (label) => `${label} 항목의 번호를 확인해주세요.`,
  youtubeInvalid: "YouTube 링크를 확인해주세요.",
  busy: "신청이 몰리고 있어요. 잠시 후 다시 시도해주세요.",
  duplicateEntry: "이미 신청하셨어요.",
};

const EN: CompetitionFormStrings = {
  required: " (required)",
  choosePlaceholder: "Please select",
  chooseFile: "Choose file",
  imageHint: (max) => `Up to 4MB each, ${max} file${max > 1 ? "s" : ""} max`,
  youtubeHint: "Private videos won't play on the judging and voting screens. Please set your video to Unlisted or Public.",
  modalTitle: "Apply",
  submit: "Submit application",
  submitting: "Submitting…",
  close: "Close",
  consent: "Consent",
  terms: "Terms",
  agreeRequired: "Please agree to the collection and use of personal data.",
  submitted: "Your application has been received.",
  submitFailed: "Submission failed. Please try again in a moment.",
  networkError: "A network error occurred.",
  uploadFailed: "Upload failed.",
  uploadNetworkError: "A network error occurred during upload.",
  previewBanner: "This is a preview. Applications are not saved.",
  previewSubmitted: "Not saved — this is a preview. Real submissions work once published.",
  entryNoLabel: "Entry no.",
  notAcceptingNow: "Applications aren't open right now.",
  fieldRequired: (label) => `Please fill in ${label}.`,
  phoneInvalid: (label) => `Please check the number for ${label}.`,
  youtubeInvalid: "Please check the YouTube link.",
  busy: "Applications are coming in fast. Please try again in a moment.",
  duplicateEntry: "You've already applied.",
};


const FR: CompetitionFormStrings = {
  required: " (obligatoire)",
  choosePlaceholder: "Veuillez choisir",
  chooseFile: "Choisir un fichier",
  imageHint: (max) => `4 Mo maximum par fichier, ${max} fichier${max > 1 ? "s" : ""} au total`,
  youtubeHint:
    "Les vidéos privées ne peuvent pas être lues sur les écrans de vote et du jury. Choisissez « Non répertoriée » ou « Publique ».",
  modalTitle: "Inscription",
  submit: "Envoyer ma candidature",
  submitting: "Envoi en cours…",
  close: "Fermer",
  consent: "Consentement",
  terms: "Conditions",
  agreeRequired: "Veuillez accepter la collecte et l'utilisation de vos données personnelles.",
  submitted: "Votre candidature a bien été reçue.",
  submitFailed: "L'envoi a échoué. Merci de réessayer dans un instant.",
  networkError: "Une erreur réseau est survenue.",
  uploadFailed: "Le téléversement a échoué.",
  uploadNetworkError: "Une erreur réseau est survenue pendant le téléversement.",
  previewBanner: "Ceci est un aperçu. Les candidatures ne sont pas enregistrées.",
  previewSubmitted: "Non enregistré — ceci est un aperçu. Les envois fonctionneront après publication.",
  entryNoLabel: "N° de dossier",
  notAcceptingNow: "Les inscriptions ne sont pas ouvertes en ce moment.",
  fieldRequired: (label) => `Merci de renseigner « ${label} ».`,
  phoneInvalid: (label) => `Merci de vérifier le numéro pour « ${label} ».`,
  youtubeInvalid: "Merci de vérifier le lien YouTube.",
  busy: "Les candidatures affluent. Merci de réessayer dans un instant.",
  duplicateEntry: "Vous avez déjà candidaté.",
};

const JA: CompetitionFormStrings = {
  required: "（必須）",
  choosePlaceholder: "選択してください",
  chooseFile: "ファイルを選択",
  imageHint: (max) => `1枚あたり4MB以下、最大${max}枚`,
  youtubeHint:
    "非公開（Private）の動画は審査・投票画面で再生されません。限定公開（Unlisted）または公開に設定してください。",
  modalTitle: "エントリー",
  submit: "応募する",
  submitting: "送信中…",
  close: "閉じる",
  consent: "同意",
  terms: "利用規約",
  agreeRequired: "個人情報の収集・利用にご同意ください。",
  submitted: "応募を受け付けました。",
  submitFailed: "受付に失敗しました。しばらくしてからもう一度お試しください。",
  networkError: "ネットワークエラーが発生しました。",
  uploadFailed: "アップロードに失敗しました。",
  uploadNetworkError: "アップロード中にネットワークエラーが発生しました。",
  previewBanner: "プレビューです。応募しても保存されません。",
  previewSubmitted: "プレビューのため保存されていません。公開後は正常に受け付けられます。",
  entryNoLabel: "エントリー番号",
  notAcceptingNow: "現在は受付期間ではありません。",
  fieldRequired: (label) => `${label}を入力してください。`,
  phoneInvalid: (label) => `${label}の番号をご確認ください。`,
  youtubeInvalid: "YouTubeのリンクをご確認ください。",
  busy: "応募が集中しています。しばらくしてからもう一度お試しください。",
  duplicateEntry: "すでに応募済みです。",
};

/**
 * **Record 로 둔다.** 삼항으로 고르면 언어를 늘렸을 때 새 언어가 조용히 한국어로 떨어진다 —
 * 고를 수는 있는데 안 바뀌는 상태가 되고 타입 검사도 통과한다. 여기 한 줄이 비면 컴파일이 깨진다.
 */
const DICT: Record<NoticeLanguage, CompetitionFormStrings> = { ko: KO, en: EN, fr: FR, ja: JA };

export function competitionFormStrings(language: NoticeLanguage): CompetitionFormStrings {
  return DICT[language] ?? KO;
}
