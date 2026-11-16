import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../configs/apiClient';
import LatexMarkdown from './common/LatexMarkdown';
import { getTopicThemeVars } from '../utils/theme';
import '../styles/LessonEditor.scss';

export default function LessonEditor() {
   const { lessonId } = useParams();
   const navigate = useNavigate();

   const [lesson, setLesson] = useState(null);
   const [topicColor, setTopicColor] = useState('#D60808');
   const [sections, setSections] = useState([]);
   const [activeSectionIdx, setActiveSectionIdx] = useState(0);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [toast, setToast] = useState(null);
   const [previewKey, setPreviewKey] = useState(0);
   // Snapshot: chỉ cập nhật khi người dùng nhấn "Làm mới"
   const [previewSection, setPreviewSection] = useState(null);

   const handleRefreshPreview = () => {
      if (globalThis.MathJax?.typesetClear) {
         try {
            globalThis.MathJax.typesetClear();
         } catch {
            // Ignore error
         }
      }
      // Chụp lại snapshot của section hiện tại (deep copy)
      setSections((prev) => {
         const sec = prev[activeSectionIdx];
         if (sec) setPreviewSection(JSON.parse(JSON.stringify(sec)));
         return prev;
      });
      setPreviewKey((prev) => prev + 1);
      showToast('Đã làm mới hiển thị xem trước', 'info');
   };

   const showToast = (message, type = 'success') => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3200);
   };

   // ── Load Lesson ──────────────────────────────────────────────────────────
   useEffect(() => {
      let isMounted = true;
      const loadData = async () => {
         setLoading(true);
         try {
            if (lessonId) {
               let lessonData = null;
               try {
                  const res = await apiClient.get(`/admin/lessons/${lessonId}`);
                  lessonData = res.data;
               } catch {
                  const res = await apiClient.get(`/lessons/${lessonId}`);
                  lessonData = res.data;
               }

               if (isMounted && lessonData) {
                  setLesson(lessonData);
                  if (lessonData.topicPrimaryColor) {
                     setTopicColor(lessonData.topicPrimaryColor);
                  }
                  const secs =
                     Array.isArray(lessonData.sections) &&
                     lessonData.sections.length > 0
                        ? lessonData.sections
                        : [
                             {
                                order: 1,
                                type: 'doc',
                                docContent: {
                                   format: 'markdown',
                                },
                             },
                          ];
                  setSections(secs);
                  // Khởi tạo snapshot ban đầu từ section đầu tiên
                  setPreviewSection(secs[0] ? JSON.parse(JSON.stringify(secs[0])) : null);
               }
            }
         } catch (err) {
            console.error('Lỗi khi tải dữ liệu bài học:', err);
            showToast('Không thể tải bài học từ máy chủ', 'error');
         } finally {
            if (isMounted) setLoading(false);
         }
      };

      loadData();
      return () => {
         isMounted = false;
      };
   }, [lessonId]);

   // Fetch topic color if not directly loaded
   useEffect(() => {
      if (!lesson?.topicSlug) return;
      let isMounted = true;
      apiClient
         .get(`/topics/${lesson.topicSlug}`)
         .then((res) => {
            if (isMounted && res.data?.primaryColor) {
               setTopicColor(res.data.primaryColor);
            }
         })
         .catch(() => {});
      return () => {
         isMounted = false;
      };
   }, [lesson?.topicSlug]);

   // Current Active Section (live – dùng cho form editor)
   const currentSection = useMemo(() => {
      if (!sections || sections.length === 0) return null;
      return sections[activeSectionIdx] || sections[0];
   }, [sections, activeSectionIdx]);

   // Khi chuyển sang section khác → reset snapshot về section mới (chưa chỉnh sửa)
   useEffect(() => {
      const sec = sections[activeSectionIdx];
      if (sec) {
         setPreviewSection(JSON.parse(JSON.stringify(sec)));
         setPreviewKey((prev) => prev + 1);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [activeSectionIdx]);

   // ── Section Updates ───────────────────────────────────────────────────────
   const updateCurrentSection = (updatedFields) => {
      setSections((prev) => {
         const copy = [...prev];
         const cur = copy[activeSectionIdx] || {};
         copy[activeSectionIdx] = { ...cur, ...updatedFields };
         return copy;
      });
   };

   const handleSwitchSectionType = (type) => {
      if (!currentSection) return;
      if (type === 'doc') {
         updateCurrentSection({
            type: 'doc',
            docContent: currentSection.docContent || {
               format: 'markdown',
               body: '',
            },
         });
      } else {
         updateCurrentSection({
            type: 'exercise',
            exercise: currentSection.exercise || {
               type: 'mcq_single',
               points: 100,
               question: '',
               payload: {
                  options: [
                     { id: 'opt_1', label: '', isCorrect: false },
                     { id: 'opt_2', label: '', isCorrect: false },
                  ],
               },
               solution: { correctAnswer: '' },
               explanation: '',
            },
         });
      }
   };

   // ── Exercise Handlers ─────────────────────────────────────────────────────
   const handleExerciseTypeChange = (eType) => {
      const ex = currentSection?.exercise || {};
      const newEx = { ...ex, type: eType };

      if (eType === 'mcq_single' || eType === 'mcq_multiple') {
         const options = newEx.payload?.options?.length
            ? newEx.payload.options
            : [
                 { id: 'opt_1', label: '', isCorrect: false },
                 { id: 'opt_2', label: '', isCorrect: false },
              ];
         newEx.payload = { ...newEx.payload, options };
         newEx.solution =
            eType === 'mcq_multiple'
               ? {
                    correctAnswers: options
                       .filter((option) => option.isCorrect)
                       .map((option) => option.id),
                 }
               : {
                    correctAnswer:
                       options.find((option) => option.isCorrect)?.id || '',
                 };
      } else if (eType === 'fill_blank') {
         newEx.payload = {
            blanks: [{ id: 'blank_1', label: 'Đáp số 1' }],
         };
         newEx.solution = {
            blanks: [{ id: 'blank_1', exactValue: '', tolerance: 0.01 }],
         };
      }

      updateCurrentSection({ exercise: newEx });
   };

   // ── Fill Blank Handlers ───────────────────────────────────────────────────
   const getExerciseBlanks = () => {
      const ex = currentSection?.exercise || {};
      const payloadBlanks = ex.payload?.blanks || [];
      const solutionBlanks = ex.solution?.blanks || [];

      if (payloadBlanks.length > 0) {
         return payloadBlanks.map((pb, idx) => {
            const sb =
               solutionBlanks.find((s) => s.id === pb.id) ||
               solutionBlanks[idx] ||
               {};
            return {
               id: pb.id || `blank_${idx + 1}`,
               label: pb.label || '',
               exactValue: sb.exactValue ?? '',
               tolerance: sb.tolerance ?? 0.01,
            };
         });
      }

      // Backward compatibility for single-value fill_blank
      return [
         {
            id: 'blank_1',
            label: ex.payload?.label || 'Đáp số',
            exactValue: ex.solution?.exactValue ?? '',
            tolerance: ex.solution?.tolerance ?? 0.01,
         },
      ];
   };

   const updateExerciseBlanks = (newBlanks) => {
      const ex = currentSection?.exercise || {};
      const payloadBlanks = newBlanks.map((b) => ({
         id: b.id,
         label: b.label,
      }));
      const solutionBlanks = newBlanks.map((b) => ({
         id: b.id,
         exactValue:
            b.exactValue === ''
               ? ''
               : isNaN(Number(b.exactValue))
                 ? b.exactValue
                 : Number(b.exactValue),
         tolerance: b.tolerance === '' ? '' : Number(b.tolerance),
      }));

      updateCurrentSection({
         exercise: {
            ...ex,
            payload: {
               ...ex.payload,
               blanks: payloadBlanks,
            },
            solution: {
               ...ex.solution,
               blanks: solutionBlanks,
            },
         },
      });
   };

   const handleAddBlank = () => {
      const currentBlanks = getExerciseBlanks();
      const newId = `blank_${Date.now()}`;
      updateExerciseBlanks([
         ...currentBlanks,
         {
            id: newId,
            label: `Đáp số ${currentBlanks.length + 1}`,
            exactValue: '',
            tolerance: 0.01,
         },
      ]);
   };

   const handleRemoveBlank = (blankId) => {
      const currentBlanks = getExerciseBlanks();
      if (currentBlanks.length <= 1) {
         showToast('Cần ít nhất một ô điền đáp số', 'error');
         return;
      }
      updateExerciseBlanks(currentBlanks.filter((b) => b.id !== blankId));
   };

   const handleBlankFieldChange = (blankId, field, value) => {
      const currentBlanks = getExerciseBlanks();
      const updated = currentBlanks.map((b) => {
         if (b.id !== blankId) return b;
         return { ...b, [field]: value };
      });
      updateExerciseBlanks(updated);
   };

   const handleAddOption = () => {
      const ex = currentSection?.exercise || {};
      const opts = [...(ex.payload?.options || [])];
      const newId = `opt_${Date.now()}`;
      opts.push({ id: newId, label: '', isCorrect: false });
      updateCurrentSection({
         exercise: {
            ...ex,
            payload: { ...ex.payload, options: opts },
         },
      });
   };

   const handleRemoveOption = (optId) => {
      const ex = currentSection?.exercise || {};
      const opts = (ex.payload?.options || []).filter((o) => o.id !== optId);
      updateCurrentSection({
         exercise: {
            ...ex,
            payload: { ...ex.payload, options: opts },
         },
      });
   };

   const handleOptionLabelChange = (optId, text) => {
      const ex = currentSection?.exercise || {};
      const opts = (ex.payload?.options || []).map((o) =>
         o.id === optId ? { ...o, label: text } : o
      );
      updateCurrentSection({
         exercise: {
            ...ex,
            payload: { ...ex.payload, options: opts },
         },
      });
   };

   const handleSelectCorrectOption = (optId) => {
      const ex = currentSection?.exercise || {};
      const isMultiple = ex.type === 'mcq_multiple';
      const opts = (ex.payload?.options || []).map((o) => {
         if (isMultiple) {
            return o.id === optId ? { ...o, isCorrect: !o.isCorrect } : o;
         }
         return { ...o, isCorrect: o.id === optId };
      });

      const updatedEx = {
         ...ex,
         payload: { ...ex.payload, options: opts },
         solution: isMultiple
            ? {
                 correctAnswers: opts
                    .filter((o) => o.isCorrect)
                    .map((o) => o.id),
              }
            : { correctAnswer: optId },
      };

      updateCurrentSection({ exercise: updatedEx });
   };

   // ── Add / Remove Section ──────────────────────────────────────────────────
   const handleAddNewSection = (type = 'doc') => {
      const newSec = {
         title: '',
         order: sections.length + 1,
         type,
         ...(type === 'doc'
            ? {
                 docContent: {
                    format: 'markdown',
                    body: '',
                 },
              }
            : {
                 exercise: {
                    type: 'mcq_single',
                    points: 100,
                    question: '',
                    payload: {
                       options: [
                          { id: 'opt_1', label: '', isCorrect: false },
                          { id: 'opt_2', label: '', isCorrect: false },
                       ],
                    },
                    solution: { correctAnswer: '' },
                    explanation: '',
                 },
              }),
      };

      const updated = [...sections, newSec];
      setSections(updated);
      setActiveSectionIdx(updated.length - 1);
      showToast(`Đã thêm phần ${updated.length}`);
   };

   const handleDeleteSection = (index) => {
      if (sections.length <= 1) {
         showToast('Bài học cần ít nhất một phần nội dung', 'error');
         return;
      }
      const updated = sections.filter((_, idx) => idx !== index);
      setSections(updated);
      setActiveSectionIdx(Math.max(0, index - 1));
      showToast('Đã xóa phần');
   };

   // ── Quick Formatting Inserts ──────────────────────────────────────────────
   const insertDocSnippet = (snippet) => {
      const currentBody = currentSection?.docContent?.body || '';
      updateCurrentSection({
         docContent: {
            format: 'markdown',
            body: currentBody + '\n' + snippet,
         },
      });
   };

   // ── Save Lesson ───────────────────────────────────────────────────────────
   const handleSaveLesson = async () => {
      if (!lesson?.title?.trim()) {
         showToast('Vui lòng nhập tiêu đề bài học', 'error');
         return;
      }
      setSaving(true);
      try {
         const payload = {
            title: lesson.title,
            slug: lesson.slug,
            description: lesson.description || '',
            chapterId: lesson.chapterId,
            isActive: lesson.isActive !== false,
            order: Number(lesson.order) || 1,
            sections,
         };

         if (lessonId) {
            await apiClient.put(`/lessons/${lessonId}`, payload);
         } else {
            const res = await apiClient.post('/lessons', payload);
            if (res.data?._id) {
               navigate(`/lesson-editor/${res.data._id}`, { replace: true });
            }
         }

         showToast('Đã lưu bài học thành công!');
      } catch (err) {
         console.error('Lỗi khi lưu bài học:', err);
         showToast(
            err.response?.data?.error || 'Có lỗi xảy ra khi lưu bài học',
            'error'
         );
      } finally {
         setSaving(false);
      }
   };

   const themeVars = useMemo(() => getTopicThemeVars(topicColor), [topicColor]);

   if (loading) {
      return (
         <div
            className="app-loading-state"
            style={{
               ...themeVars,
               minHeight: '60vh',
               display: 'flex',
               flexDirection: 'column',
               alignItems: 'center',
               justifyContent: 'center',
            }}
         >
            <span
               className="material-symbols-outlined spin-icon"
               style={{ fontSize: '2.5rem', color: 'var(--primary-color)' }}
            >
               progress_activity
            </span>
            <p style={{ marginTop: '0.75rem', fontWeight: 600 }}>
               Đang tải không gian soạn thảo SciSolve Studio...
            </p>
         </div>
      );
   }

   return (
      <div className="lesson-editor-page" style={themeVars}>
         {/* Toast Notification */}
         {toast && (
            <div className={`app-toast ${toast.type}`}>
               <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '1.2rem' }}
               >
                  {toast.type === 'error' ? 'error' : 'check_circle'}
               </span>
               <span>{toast.message}</span>
            </div>
         )}

         {/* ================= MAIN WORKSPACE ================= */}
         <main className="le-main-container">
            {/* METADATA CỦA BÀI HỌC (LESSON LEVEL) */}
            <div className="le-meta-card">
               <div className="le-meta-grid">
                  <div className="le-field-group">
                     <label>
                        Tiêu đề bài học <span className="req">*</span>
                     </label>
                     <input
                        type="text"
                        value={lesson?.title || ''}
                        onChange={(e) =>
                           setLesson((prev) => ({
                              ...prev,
                              title: e.target.value,
                           }))
                        }
                        placeholder="Ví dụ: Cân bằng lực ma sát và Phản lực pháp tuyến..."
                     />
                  </div>
               </div>
            </div>

            {/* WORKSPACE 2 CỘT */}
            <div className="le-workspace-grid">
               {/* ================= CỘT TRÁI: FORM SOẠN THẢO SECTION ================= */}
               <section className="le-editor-pane">
                  {/* CARD: CẤU HÌNH SECTION HIỆN TẠI */}
                  <div className="le-section-card">
                     <div className="le-section-card-header">
                        <div className="header-info">
                           <span className="section-badge">
                              Phần {activeSectionIdx + 1} / {sections.length}
                           </span>
                           <h2 className="section-card-title">Nội dung</h2>
                        </div>

                        {/* Switch Type Buttons */}
                        <div className="section-type-toggle">
                           <button
                              type="button"
                              onClick={() =>
                                 handleSwitchSectionType('exercise')
                              }
                              className={`btn-type ${currentSection?.type === 'exercise' ? 'active' : ''}`}
                           >
                              Bài tập
                           </button>
                           <button
                              type="button"
                              onClick={() => handleSwitchSectionType('doc')}
                              className={`btn-type ${currentSection?.type === 'doc' ? 'active' : ''}`}
                           >
                              Lí thuyết
                           </button>
                        </div>
                     </div>

                     {/* Hàng: Tiêu đề phần & Dạng bài tập */}
                     <div
                        className={`le-section-title-row ${currentSection?.type === 'exercise' ? 'is-exercise' : ''}`}
                     >
                        <div className="le-field-col">
                           <div className="field-top">
                              <label>Tiêu đề phần</label>
                              {sections.length > 1 &&
                                 currentSection?.type !== 'exercise' && (
                                    <button
                                       type="button"
                                       onClick={() =>
                                          handleDeleteSection(activeSectionIdx)
                                       }
                                       className="btn-del-section"
                                    >
                                       <span
                                          className="material-symbols-outlined"
                                          style={{ fontSize: '1rem' }}
                                       >
                                          delete
                                       </span>
                                       Xóa phần này
                                    </button>
                                 )}
                           </div>
                           <input
                              type="text"
                              value={currentSection?.title || ''}
                              onChange={(e) =>
                                 updateCurrentSection({ title: e.target.value })
                              }
                              placeholder="Tiêu đề phần..."
                           />
                        </div>

                        {currentSection?.type === 'exercise' && (
                           <div className="le-field-col">
                              <div className="field-top">
                                 <label>Dạng bài tập</label>
                                 {sections.length > 1 && (
                                    <button
                                       type="button"
                                       onClick={() =>
                                          handleDeleteSection(activeSectionIdx)
                                       }
                                       className="btn-del-section"
                                    >
                                       <span
                                          className="material-symbols-outlined"
                                          style={{ fontSize: '1rem' }}
                                       >
                                          delete
                                       </span>
                                       Xóa phần này
                                    </button>
                                 )}
                              </div>
                              <select
                                 value={
                                    currentSection?.exercise?.type ||
                                    'mcq_single'
                                 }
                                 onChange={(e) =>
                                    handleExerciseTypeChange(e.target.value)
                                 }
                              >
                                 <option value="mcq_single">
                                    Trắc nghiệm 1 đáp án (mcq_single)
                                 </option>
                                 <option value="mcq_multiple">
                                    Trắc nghiệm nhiều đáp án (mcq_multiple)
                                 </option>
                                 <option value="fill_blank">
                                    Điền số / kết quả (fill_blank)
                                 </option>
                              </select>
                           </div>
                        )}
                     </div>

                     {/* ── FORM BÀI TẬP (EXERCISE BUILDER) ── */}
                     {currentSection?.type === 'exercise' && (
                        <div className="le-exercise-form">
                           {/* Đề bài */}
                           <div className="form-group">
                              <label>Nội dung câu hỏi</label>
                              <textarea
                                 rows={3}
                                 placeholder="Nhập nội dung đề bài"
                                 value={
                                    currentSection?.exercise?.question || ''
                                 }
                                 onChange={(e) =>
                                    updateCurrentSection({
                                       exercise: {
                                          ...currentSection.exercise,
                                          question: e.target.value,
                                       },
                                    })
                                 }
                              />
                           </div>

                           {/* MCQ Options */}
                           {(currentSection?.exercise?.type === 'mcq_single' ||
                              currentSection?.exercise?.type ===
                                 'mcq_multiple') && (
                              <div className="options-block">
                                 <div className="options-header">
                                    <span className="opts-title">
                                       Các phương án & Đáp án đúng
                                    </span>
                                    <span className="opts-sub">
                                       Tích chọn để làm đáp án đúng
                                    </span>
                                 </div>

                                 <div className="options-list">
                                    {(
                                       currentSection?.exercise?.payload
                                          ?.options || []
                                    ).map((opt) => (
                                       <div
                                          key={opt.id}
                                          className={`opt-row ${opt.isCorrect ? 'correct' : ''}`}
                                       >
                                          <input
                                             type={
                                                currentSection?.exercise
                                                   ?.type === 'mcq_multiple'
                                                   ? 'checkbox'
                                                   : 'radio'
                                             }
                                             name="correct_answer_choice"
                                             checked={Boolean(opt.isCorrect)}
                                             onChange={() =>
                                                handleSelectCorrectOption(
                                                   opt.id
                                                )
                                             }
                                             className="opt-control"
                                             title="Chọn làm đáp án đúng"
                                          />
                                          <input
                                             type="text"
                                             className="opt-input"
                                             value={opt.label || ''}
                                             onChange={(e) =>
                                                handleOptionLabelChange(
                                                   opt.id,
                                                   e.target.value
                                                )
                                             }
                                             placeholder="Nội dung phương án..."
                                          />
                                          <button
                                             type="button"
                                             onClick={() =>
                                                handleRemoveOption(opt.id)
                                             }
                                             className="btn-remove-opt"
                                             title="Xóa lựa chọn này"
                                          >
                                             ✕
                                          </button>
                                       </div>
                                    ))}
                                 </div>

                                 <button
                                    type="button"
                                    onClick={handleAddOption}
                                    className="btn-add-opt"
                                 >
                                    <span
                                       className="material-symbols-outlined"
                                       style={{ fontSize: '1rem' }}
                                    >
                                       add_circle
                                    </span>
                                    <span>Thêm lựa chọn đáp án</span>
                                 </button>
                              </div>
                           )}

                           {/* Fill blank config */}
                           {currentSection?.exercise?.type === 'fill_blank' &&
                              (() => {
                                 const blanks = getExerciseBlanks();
                                 return (
                                    <div className="le-fill-blanks-block">
                                       <div className="fb-manager-header">
                                          <div>
                                             <span className="fb-manager-title">
                                                Các ô điền đáp số
                                             </span>
                                             <span className="fb-manager-sub">
                                                Tạo một hoặc nhiều ô để học sinh
                                                điền giá trị
                                             </span>
                                          </div>
                                          <button
                                             type="button"
                                             onClick={handleAddBlank}
                                             className="btn-add-blank"
                                          >
                                             <span
                                                className="material-symbols-outlined"
                                                style={{ fontSize: '1rem' }}
                                             >
                                                add_circle
                                             </span>
                                             <span>Thêm ô đáp số</span>
                                          </button>
                                       </div>

                                       <div className="fb-blanks-list">
                                          {blanks.map((blank, idx) => (
                                             <div
                                                key={blank.id}
                                                className="fb-blank-card"
                                             >
                                                <div className="fb-card-top">
                                                   <span className="fb-blank-badge">
                                                      Ô #{idx + 1}
                                                   </span>
                                                   {blanks.length > 1 && (
                                                      <button
                                                         type="button"
                                                         onClick={() =>
                                                            handleRemoveBlank(
                                                               blank.id
                                                            )
                                                         }
                                                         className="btn-remove-blank"
                                                         title="Xóa ô này"
                                                      >
                                                         <span
                                                            className="material-symbols-outlined"
                                                            style={{
                                                               fontSize:
                                                                  '0.95rem',
                                                            }}
                                                         >
                                                            delete
                                                         </span>
                                                         Xóa ô này
                                                      </button>
                                                   )}
                                                </div>

                                                <div className="fb-card-grid">
                                                   <div className="fb-input-col fb-label-col">
                                                      <label>
                                                         Label / Tên ô tương ứng
                                                      </label>
                                                      <input
                                                         type="text"
                                                         placeholder="Ví dụ: Vận tốc v₁ (m/s) hoặc Gia tốc a..."
                                                         value={
                                                            blank.label || ''
                                                         }
                                                         onChange={(e) =>
                                                            handleBlankFieldChange(
                                                               blank.id,
                                                               'label',
                                                               e.target.value
                                                            )
                                                         }
                                                      />
                                                   </div>
                                                   <div className="fb-input-col fb-value-col">
                                                      <label>
                                                         Đáp số chuẩn
                                                      </label>
                                                      <input
                                                         type="number"
                                                         step="any"
                                                         placeholder="Ví dụ: 42.4"
                                                         value={
                                                            blank.exactValue ??
                                                            ''
                                                         }
                                                         onChange={(e) =>
                                                            handleBlankFieldChange(
                                                               blank.id,
                                                               'exactValue',
                                                               e.target.value
                                                            )
                                                         }
                                                      />
                                                   </div>
                                                   <div className="fb-input-col fb-tol-col">
                                                      <label>Sai số (±)</label>
                                                      <input
                                                         type="number"
                                                         step="any"
                                                         placeholder="0.01"
                                                         value={
                                                            blank.tolerance ??
                                                            0.01
                                                         }
                                                         onChange={(e) =>
                                                            handleBlankFieldChange(
                                                               blank.id,
                                                               'tolerance',
                                                               e.target.value
                                                            )
                                                         }
                                                      />
                                                   </div>
                                                </div>
                                             </div>
                                          ))}
                                       </div>
                                    </div>
                                 );
                              })()}

                           {/* Lời giải chi tiết */}
                           <div
                              className="form-group"
                              style={{
                                 paddingTop: '0.5rem',
                                 borderTop: '1px solid rgba(0,0,0,0.06)',
                              }}
                           >
                              <label>Lời giải chi tiết</label>
                              <textarea
                                 rows={2}
                                 placeholder="Nhập lời giải thích..."
                                 value={
                                    currentSection?.exercise?.explanation || ''
                                 }
                                 onChange={(e) =>
                                    updateCurrentSection({
                                       exercise: {
                                          ...currentSection.exercise,
                                          explanation: e.target.value,
                                       },
                                    })
                                 }
                              />
                           </div>
                        </div>
                     )}

                     {currentSection?.type === 'doc' && (
                        <div className="le-doc-form">
                           <div className="doc-toolbar">
                              <label>
                                 Nội dung bài viết (Markdown & LaTeX)
                              </label>
                              <div className="tools-group">
                                 <button
                                    type="button"
                                    onClick={() =>
                                       insertDocSnippet('**Văn bản in đậm**')
                                    }
                                    title="Chèn in đậm"
                                 >
                                    B
                                 </button>
                                 <button
                                    type="button"
                                    onClick={() =>
                                       insertDocSnippet('*Văn bản in nghiêng*')
                                    }
                                    title="Chèn in nghiêng"
                                 >
                                    I
                                 </button>
                                 <button
                                    type="button"
                                    onClick={() => insertDocSnippet('$$ $$')}
                                    className="tool-latex"
                                    title="Chèn công thức LaTeX khối"
                                 >
                                    LaTeX
                                 </button>
                              </div>
                           </div>
                           <textarea
                              rows={12}
                              value={currentSection?.docContent?.body || ''}
                              onChange={(e) =>
                                 updateCurrentSection({
                                    docContent: {
                                       format: 'markdown',
                                       body: e.target.value,
                                    },
                                 })
                              }
                           />
                        </div>
                     )}
                  </div>
               </section>

               {/* ================= CỘT PHẢI: LIVE PREVIEW (SNAPSHOT) ================= */}
               <aside className="le-preview-pane">
                  <div className="le-preview-card">
                     <div className="preview-header-bar">
                        <div className="ph-left">
                           <span className="live-dot"></span>
                           <span className="ph-title">Xem trước</span>
                        </div>
                        <button
                           type="button"
                           onClick={handleRefreshPreview}
                           className="btn-refresh-preview"
                           title="Làm mới lại khung xem trước Markdown & LaTeX"
                        >
                           <span className="material-symbols-outlined">
                              refresh
                           </span>
                           <span>Làm mới</span>
                        </button>
                     </div>

                     {/* Preview render từ snapshot – không tự cập nhật */}
                     <div className="preview-body" key={previewKey}>
                        <h3 className="preview-sec-title">
                           {previewSection?.title || 'Tiêu đề phần'}
                        </h3>

                        {previewSection?.type === 'doc' ? (
                           <div className="preview-doc-content">
                              <LatexMarkdown
                                 content={
                                    previewSection?.docContent?.body ||
                                    '_Chưa có nội dung lí thuyết..._'
                                 }
                              />
                           </div>
                        ) : (
                           <div className="preview-exercise-content">
                              <div className="preview-question">
                                 <LatexMarkdown
                                    content={
                                       previewSection?.exercise?.question ||
                                       '_Chưa có câu hỏi..._'
                                    }
                                 />
                              </div>

                              {/* Preview MCQ */}
                              {(previewSection?.exercise?.type ===
                                 'mcq_single' ||
                                 previewSection?.exercise?.type ===
                                    'mcq_multiple') && (
                                 <div className="preview-options-list">
                                    {(
                                       previewSection?.exercise?.payload
                                          ?.options || []
                                    ).map((opt) => (
                                       <div
                                          key={opt.id}
                                          className={`prev-opt ${opt.isCorrect ? 'is-correct' : ''}`}
                                       >
                                          <input
                                             type={
                                                previewSection?.exercise
                                                   ?.type === 'mcq_multiple'
                                                   ? 'checkbox'
                                                   : 'radio'
                                             }
                                             readOnly
                                             checked={Boolean(opt.isCorrect)}
                                          />
                                          <div className="prev-opt-text">
                                             <LatexMarkdown
                                                content={opt.label || '...'}
                                             />
                                          </div>
                                          {opt.isCorrect && (
                                             <span className="badge-answer">
                                                Đáp án
                                             </span>
                                          )}
                                       </div>
                                    ))}
                                 </div>
                              )}

                              {/* Preview Fill Blank – đọc từ snapshot */}
                              {previewSection?.exercise?.type ===
                                 'fill_blank' &&
                                 (() => {
                                    const pvBlanks =
                                       previewSection.exercise.payload
                                          ?.blanks || [];
                                    const pvSolution =
                                       previewSection.exercise.solution
                                          ?.blanks || [];
                                    const displayBlanks =
                                       pvBlanks.length > 0
                                          ? pvBlanks.map((pb, idx) => {
                                               const sb =
                                                  pvSolution.find(
                                                     (s) => s.id === pb.id
                                                  ) ||
                                                  pvSolution[idx] ||
                                                  {};
                                               return {
                                                  id: pb.id,
                                                  label: pb.label || '',
                                                  exactValue:
                                                     sb.exactValue ?? '',
                                                  tolerance:
                                                     sb.tolerance ?? 0.01,
                                               };
                                            })
                                          : [
                                               {
                                                  id: 'blank_1',
                                                  label:
                                                     previewSection.exercise
                                                        .payload?.label ||
                                                     'Đáp số',
                                                  exactValue:
                                                     previewSection.exercise
                                                        .solution?.exactValue ??
                                                     '',
                                                  tolerance:
                                                     previewSection.exercise
                                                        .solution?.tolerance ??
                                                     0.01,
                                               },
                                            ];
                                    return (
                                       <div className="preview-fill-blanks-list">
                                          {displayBlanks.map((blank, idx) => (
                                             <div
                                                key={blank.id || idx}
                                                className="prev-fb-item"
                                             >
                                                <div className="prev-fb-label">
                                                   <span className="prev-fb-idx">
                                                      {idx + 1}.
                                                   </span>
                                                   <div className="prev-fb-title">
                                                      <LatexMarkdown
                                                         content={
                                                            blank.label ||
                                                            `Đáp số ${idx + 1}`
                                                         }
                                                      />
                                                   </div>
                                                </div>
                                                <div className="prev-fb-input-wrap">
                                                   <input
                                                      type="text"
                                                      disabled
                                                      placeholder="Ô nhập đáp án của học sinh..."
                                                   />
                                                   <span className="fb-hint">
                                                      (Đáp số:{' '}
                                                      <strong>
                                                         {blank.exactValue !==
                                                            '' &&
                                                         blank.exactValue !==
                                                            undefined
                                                            ? blank.exactValue
                                                            : '--'}
                                                      </strong>
                                                      , sai số ±
                                                      {blank.tolerance !== '' &&
                                                      blank.tolerance !==
                                                         undefined
                                                         ? blank.tolerance
                                                         : 0.01}
                                                      )
                                                   </span>
                                                </div>
                                             </div>
                                          ))}
                                       </div>
                                    );
                                 })()}

                              {/* Preview Explanation */}
                              {previewSection?.exercise?.explanation && (
                                 <div className="preview-explanation-box">
                                    <div className="exp-header">Lời giải:</div>
                                    <div className="exp-body">
                                       <LatexMarkdown
                                          content={
                                             previewSection.exercise.explanation
                                          }
                                       />
                                    </div>
                                 </div>
                              )}
                           </div>
                        )}
                     </div>
                  </div>
               </aside>
            </div>
         </main>

         {/* ================= BOTTOM CAROUSEL ================= */}
         <footer className="le-bottom-bar">
            <div className="bottom-container">
               <span className="bar-label">Các phần của bài:</span>

               <div className="sections-carousel">
                  {sections.map((sec, idx) => {
                     const isActive = idx === activeSectionIdx;
                     const isDoc = sec.type === 'doc';

                     return (
                        <button
                           key={idx}
                           type="button"
                           onClick={() => setActiveSectionIdx(idx)}
                           className={`btn-sec-pill ${isActive ? 'active' : ''}`}
                        >
                           <span
                              className={`pill-dot ${isDoc ? 'doc' : 'exercise'}`}
                           />
                           <span className="pill-title">
                              {sec.title || `Phần ${idx + 1}`}
                           </span>
                           <span className="pill-type">[{sec.type}]</span>
                        </button>
                     );
                  })}

                  <div className="add-sec-group">
                     <button
                        type="button"
                        onClick={() => handleAddNewSection('doc')}
                        className="btn-add-sec add-doc"
                        title="Thêm phần lí thuyết mới"
                     >
                        <span
                           className="material-symbols-outlined"
                           style={{ fontSize: '1rem' }}
                        >
                           add
                        </span>
                        <span>Lí thuyết</span>
                     </button>
                     <button
                        type="button"
                        onClick={() => handleAddNewSection('exercise')}
                        className="btn-add-sec add-ex"
                        title="Thêm phần bài tập mới"
                     >
                        <span
                           className="material-symbols-outlined"
                           style={{ fontSize: '1rem' }}
                        >
                           add
                        </span>
                        <span>Bài tập</span>
                     </button>
                  </div>
               </div>

               <button
                  type="button"
                  onClick={handleSaveLesson}
                  disabled={saving}
                  className="bottom-save-btn"
               >
                  {saving ? 'Đang lưu...' : 'Lưu tất cả'}
               </button>
            </div>
         </footer>
      </div>
   );
}
