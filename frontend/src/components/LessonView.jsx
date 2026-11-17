import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import apiClient from '../configs/apiClient';
import LatexMarkdown from './common/LatexMarkdown';
import { getTopicThemeVars } from '../utils/theme';
import '../styles/LessonView.scss';

export default function LessonView() {
   const { slug, lessonId } = useParams();
   const location = useLocation();
   const navigate = useNavigate();

   const cachedColor =
      location.state?.topicColor ||
      (slug ? sessionStorage.getItem(`topic_color_${slug}`) : null);

   const [lesson, setLesson] = useState(null);
   const [topicChapters, setTopicChapters] = useState([]);
   const [topicColor, setTopicColor] = useState(cachedColor);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState('');

   // Active section index inside the lesson
   const [activeSectionIdx, setActiveSectionIdx] = useState(0);

   // User answers & results per section
   const [userAnswers, setUserAnswers] = useState({});
   const [exerciseResults, setExerciseResults] = useState({});
   const [submitting, setSubmitting] = useState(false);
   const [expandedExplanations, setExpandedExplanations] = useState({});
   const [isHoldingGiveUp, setIsHoldingGiveUp] = useState(false);
   const giveUpTimerRef = useRef(null);

   // Load lesson data
   useEffect(() => {
      let isMounted = true;
      const loadLesson = async () => {
         if (!lessonId) return;
         setLoading(true);
         setError('');
         try {
            const res = await apiClient.get(`/lessons/${lessonId}`);
            if (isMounted) {
               setLesson(res.data);
               if (res.data.topicPrimaryColor) {
                  setTopicColor(res.data.topicPrimaryColor);
                  if (res.data.topicSlug) {
                     sessionStorage.setItem(
                        `topic_color_${res.data.topicSlug}`,
                        res.data.topicPrimaryColor
                     );
                  }
               }
               setActiveSectionIdx(0);
            }
         } catch (err) {
            if (isMounted) {
               setError(
                  err.response?.data?.error || 'Không thể tải nội dung bài học.'
               );
            }
         } finally {
            if (isMounted) setLoading(false);
         }
      };

      loadLesson();
      return () => {
         isMounted = false;
      };
   }, [lessonId]);

   useEffect(() => {
      if (!lesson?.topicSlug) {
         setTopicChapters([]);
         return;
      }

      let isMounted = true;
      const loadTopicChapters = async () => {
         try {
            const res = await apiClient.get(`/topics/${lesson.topicSlug}`);
            if (isMounted) {
               setTopicChapters(res.data.chapters || []);
               if (res.data.primaryColor) {
                  setTopicColor(res.data.primaryColor);
                  if (lesson?.topicSlug) {
                     sessionStorage.setItem(
                        `topic_color_${lesson.topicSlug}`,
                        res.data.primaryColor
                     );
                  }
               }
            }
         } catch {
            if (isMounted) setTopicChapters([]);
         }
      };

      loadTopicChapters();
      return () => {
         isMounted = false;
      };
   }, [lesson?.topicSlug]);

   const sections = useMemo(() => lesson?.sections || [], [lesson]);
   const currentSection = sections[activeSectionIdx] || null;
   const currentAnswer = userAnswers[activeSectionIdx];
   const hasAnswer = useMemo(() => {
      if (!currentSection || currentSection.type !== 'exercise') return true;
      if (currentSection.exercise?.type === 'fill_blank') {
         const blanks = currentSection.exercise?.payload?.blanks;
         if (Array.isArray(blanks) && blanks.length > 0) {
            const ansObj =
               typeof currentAnswer === 'object' &&
               !Array.isArray(currentAnswer) &&
               currentAnswer !== null
                  ? currentAnswer
                  : {};
            return blanks.every((b) => {
               const val = ansObj[b.id];
               return (
                  val !== undefined &&
                  val !== null &&
                  String(val).trim().length > 0
               );
            });
         }
         return typeof currentAnswer === 'string'
            ? currentAnswer.trim().length > 0
            : currentAnswer !== undefined &&
                 currentAnswer !== null &&
                 String(currentAnswer).trim().length > 0;
      }
      return Array.isArray(currentAnswer)
         ? currentAnswer.length > 0
         : typeof currentAnswer === 'string'
           ? currentAnswer.trim().length > 0
           : currentAnswer !== undefined && currentAnswer !== null;
   }, [currentSection, currentAnswer]);
   const chaptersForNavigation =
      topicChapters.length > 0
         ? topicChapters
         : lesson?.chapterLessons?.length
           ? [
                {
                   _id: lesson.chapterId,
                   order: lesson.chapterOrder,
                   name: lesson.chapterTitle,
                   lessons: lesson.chapterLessons,
                },
             ]
           : [];

   // Handle answering MCQ single
   const handleSelectOption = (optId) => {
      setUserAnswers((prev) => ({
         ...prev,
         [activeSectionIdx]: optId,
      }));
   };

   // Handle answering MCQ multiple
   const handleToggleMultipleOption = (optId) => {
      const current = Array.isArray(userAnswers[activeSectionIdx])
         ? [...userAnswers[activeSectionIdx]]
         : [];
      const updated = current.includes(optId)
         ? current.filter((id) => id !== optId)
         : [...current, optId];

      setUserAnswers((prev) => ({
         ...prev,
         [activeSectionIdx]: updated,
      }));
   };

   // Handle fill blank
   const handleFillBlankChange = (blankId, val) => {
      setUserAnswers((prev) => {
         const current = prev[activeSectionIdx];
         const curObj =
            typeof current === 'object' &&
            !Array.isArray(current) &&
            current !== null
               ? { ...current }
               : typeof current === 'string'
                 ? { [blankId]: current }
                 : {};

         return {
            ...prev,
            [activeSectionIdx]: {
               ...curObj,
               [blankId]: val,
            },
         };
      });
   };

   // Submit answer to backend
   const handleSubmitExercise = async () => {
      if (!lesson || !currentSection || currentSection.type !== 'exercise')
         return;

      if (!hasAnswer) return;

      const answer = currentAnswer;
      const token = localStorage.getItem('token');
      if (!token) {
         alert('Vui lòng đăng nhập để nộp câu trả lời.');
         return;
      }

      setSubmitting(true);
      try {
         const res = await apiClient.post(
            `/lessons/${lesson._id}/exercises/${activeSectionIdx}/submit`,
            { answer },
            { headers: { Authorization: `Bearer ${token}` } }
         );

         setExerciseResults((prev) => ({
            ...prev,
            [activeSectionIdx]: res.data,
         }));

         if (res.data.isCorrect) {
            setExpandedExplanations((prev) => ({
               ...prev,
               [activeSectionIdx]: true,
            }));
         } else {
            setExpandedExplanations((prev) => ({
               ...prev,
               [activeSectionIdx]: false,
            }));
         }
      } catch (err) {
         alert(
            err.response?.data?.error ||
               'Không thể gửi câu trả lời. Vui lòng kiểm tra lại đăng nhập.'
         );
      } finally {
         setSubmitting(false);
      }
   };

   // Toggle explanation accordion
   const toggleExplanation = (idx) => {
      setExpandedExplanations((prev) => ({
         ...prev,
         [idx]: !prev[idx],
      }));
   };

   // Advance to next section or complete lesson
   const handleNextStep = () => {
      if (activeSectionIdx < sections.length - 1) {
         setActiveSectionIdx((prev) => prev + 1);
         window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
         const backUrl = lesson?.topicSlug
            ? `/topics/${lesson.topicSlug}`
            : '/topics';
         navigate(backUrl);
      }
   };

   const cancelGiveUpHold = () => {
      if (giveUpTimerRef.current !== null) {
         clearTimeout(giveUpTimerRef.current);
         giveUpTimerRef.current = null;
      }
      setIsHoldingGiveUp(false);
   };

   const handleGiveUp = async () => {
      if (!lesson || !currentSection || currentSection.type !== 'exercise')
         return;

      const token = localStorage.getItem('token');
      if (!token) {
         alert('Vui lòng đăng nhập để xem đáp án.');
         return;
      }

      setSubmitting(true);
      try {
         const res = await apiClient.post(
            `/lessons/${lesson._id}/exercises/${activeSectionIdx}/give-up`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
         );

         setExerciseResults((prev) => ({
            ...prev,
            [activeSectionIdx]: res.data,
         }));

         setExpandedExplanations((prev) => ({
            ...prev,
            [activeSectionIdx]: true,
         }));
      } catch (err) {
         try {
            const fallbackRes = await apiClient.post(
               `/lessons/${lesson._id}/exercises/${activeSectionIdx}/submit`,
               { giveUp: true },
               { headers: { Authorization: `Bearer ${token}` } }
            );
            setExerciseResults((prev) => ({
               ...prev,
               [activeSectionIdx]: fallbackRes.data,
            }));
            setExpandedExplanations((prev) => ({
               ...prev,
               [activeSectionIdx]: true,
            }));
         } catch {
            alert(
               err.response?.data?.error ||
                  'Không thể lấy đáp án bài tập lúc này.'
            );
         }
      } finally {
         setSubmitting(false);
      }
   };

   const startGiveUpHold = () => {
      if (giveUpTimerRef.current !== null) return;
      setIsHoldingGiveUp(true);
      giveUpTimerRef.current = setTimeout(() => {
         giveUpTimerRef.current = null;
         setIsHoldingGiveUp(false);
         handleGiveUp();
      }, 1400);
   };

   useEffect(
      () => () => {
         if (giveUpTimerRef.current !== null)
            clearTimeout(giveUpTimerRef.current);
      },
      []
   );

   const themeVars = useMemo(() => getTopicThemeVars(topicColor), [topicColor]);

   if (loading) {
      return (
         <div
            className="lesson-view-page"
            style={{
               ...themeVars,
               alignItems: 'center',
               justifyContent: 'center',
            }}
         >
            <span
               className="material-symbols-outlined spin-icon"
               style={{ fontSize: '3rem', color: 'var(--primary-color)' }}
            >
               progress_activity
            </span>
            <p style={{ marginTop: '1rem', fontWeight: 700, color: 'var(--color-text, #111827)' }}>
               Đang tải bài học...
            </p>
         </div>
      );
   }

   if (error || !lesson) {
      return (
         <div
            className="lesson-view-page"
            style={{
               ...themeVars,
               alignItems: 'center',
               justifyContent: 'center',
               padding: '2rem',
            }}
         >
            <span
               className="material-symbols-outlined"
               style={{ fontSize: '3.5rem', color: 'var(--primary-color)' }}
            >
               error_outline
            </span>
            <h2 style={{ margin: '1rem 0 0.5rem 0', fontWeight: 800 }}>
               {error || 'Không tìm thấy bài học'}
            </h2>
            <p style={{ color: 'rgba(0,0,0,0.6)', marginBottom: '1.5rem' }}>
               Bài học này không tồn tại hoặc bạn chưa có quyền truy cập.
            </p>
            <button className="btn-common" onClick={() => navigate('/topics')}>
               Quay lại danh mục môn học
            </button>
         </div>
      );
   }

   const topicBackUrl = lesson.topicSlug
      ? `/topics/${lesson.topicSlug}`
      : '/topics';
   const currentResult = exerciseResults[activeSectionIdx];
   const isCheckingAnswer =
      currentSection?.type === 'exercise' &&
      !currentResult?.isCorrect &&
      !currentResult?.gaveUp;
   const isLastSection = activeSectionIdx === sections.length - 1;

   return (
      <div className="lesson-view-page" style={themeVars}>
         {/* ================= MAIN WORKSPACE AREA (NO TOP HEADER) ================= */}
         <div className="lv-workspace-container">
            {/* BEGIN: LeftSidebar (Outline, 260px) */}
            <aside className="lv-sidebar">
               <div>
                  <Link
                     to={topicBackUrl}
                     className="sidebar-back-btn"
                     title="Quay lại khóa học"
                  >
                     <span className="material-symbols-outlined">
                        arrow_back
                     </span>
                     <span>Quay lại Khóa học</span>
                  </Link>

                  {/* Topic Box */}
                  <div className="sidebar-topic-card">
                     <h2 className="topic-heading">
                        {lesson.topicTitle || 'Chuyên đề'}
                     </h2>
                     <p className="topic-sub">
                        {lesson.chapterTitle
                           ? `Chương ${lesson.chapterOrder}: ${lesson.chapterTitle}`
                           : 'Nội dung bài học'}
                     </p>
                  </div>

                  <div className="sidebar-section-title">Chương và bài học</div>
                  <nav
                     className="sidebar-curriculum-list"
                     aria-label="Danh sách chương và bài học"
                  >
                     {chaptersForNavigation.map((chapter) => (
                        <section className="sidebar-chapter" key={chapter._id}>
                           <h3 className="sidebar-chapter-heading">
                              <span className="chapter-order">
                                 Chương {chapter.order || 1}
                              </span>
                              <span className="chapter-name">
                                 {chapter.name}
                              </span>
                           </h3>
                           <div className="sidebar-list">
                              {(chapter.lessons || []).map((item, index) => {
                                 const isCurrent = item._id === lesson._id;
                                 const lessonUrl = lesson.topicSlug
                                    ? `/topics/${lesson.topicSlug}/lesson/${item._id}`
                                    : `/lessons/${item._id}`;

                                 return (
                                    <Link
                                       key={item._id}
                                       to={lessonUrl}
                                       state={{ topicColor }}
                                       className={`sidebar-item ${isCurrent ? 'active' : ''}`}
                                       aria-current={
                                          isCurrent ? 'page' : undefined
                                       }
                                    >
                                       <div className="item-left">
                                          <span
                                             className="material-symbols-outlined"
                                             aria-hidden="true"
                                          >
                                             menu_book
                                          </span>
                                          <span className="item-text">
                                             {index + 1}. {item.title}
                                          </span>
                                       </div>
                                    </Link>
                                 );
                              })}
                           </div>
                        </section>
                     ))}
                  </nav>
               </div>
            </aside>

            <main className="lv-main-content">
               <div className="lv-left-pane">
                  {/* Theory Content Block (Markdown & LaTeX) */}
                  {currentSection?.type === 'doc' && (
                     <div className="content-card-box">
                        <div className="content-body-serif">
                           <LatexMarkdown
                              content={
                                 currentSection.docContent?.body ||
                                 'Chưa có nội dung văn bản lí thuyết.'
                              }
                           />
                        </div>
                     </div>
                  )}

                  {/* Exercise Context / Problem Narrative */}
                  {currentSection?.type === 'exercise' && (
                     <div className="content-card-box">
                        <div className="content-body-serif">
                           <LatexMarkdown
                              content={
                                 currentSection.exercise?.question ||
                                 'Nội dung câu hỏi đang được biên soạn...'
                              }
                           />
                        </div>
                        {(currentResult?.isCorrect || currentResult?.gaveUp) &&
                           currentResult.explanation && (
                              <div className="explanation-accordion">
                                 <button
                                    type="button"
                                    className="btn-toggle-exp"
                                    onClick={() =>
                                       toggleExplanation(activeSectionIdx)
                                    }
                                 >
                                    <span className="exp-title-group">
                                       <span className="material-symbols-outlined">
                                          menu_book
                                       </span>
                                       <span>Lời giải chi tiết</span>
                                    </span>
                                    <span
                                       className={`material-symbols-outlined arrow-icon ${expandedExplanations[activeSectionIdx] ? 'open' : ''}`}
                                    >
                                       expand_more
                                    </span>
                                 </button>
                                 {expandedExplanations[activeSectionIdx] && (
                                    <div className="exp-body">
                                       <LatexMarkdown
                                          content={currentResult.explanation}
                                       />
                                    </div>
                                 )}
                              </div>
                           )}
                     </div>
                  )}
               </div>

               <div className="lv-right-pane">
                  <div className="lv-right-progress-strip">
                     <div className="lv-progress-segments">
                        {sections.map((sec, idx) => {
                           const isDone = Boolean(
                              exerciseResults[idx]?.isCorrect ||
                              exerciseResults[idx]?.gaveUp ||
                              (sec.type === 'doc' && idx < activeSectionIdx)
                           );
                           const isActive = idx === activeSectionIdx;

                           return (
                              <button
                                 type="button"
                                 key={idx}
                                 className="lv-progress-segment"
                                 aria-label={`Phần ${idx + 1}: ${sec.title || ''}`}
                                 onClick={() => setActiveSectionIdx(idx)}
                                 title={`Phần ${idx + 1}: ${sec.title}`}
                              >
                                 <div
                                    className={`segment-bar ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}
                                 />
                              </button>
                           );
                        })}
                     </div>
                     <div className="section-nav-controls">
                        <button
                           type="button"
                           className="section-nav-button"
                           aria-label="Phần trước"
                           title="Phần trước"
                           disabled={activeSectionIdx === 0}
                           onClick={() =>
                              setActiveSectionIdx((idx) => Math.max(0, idx - 1))
                           }
                        >
                           <span className="material-symbols-outlined">
                              chevron_left
                           </span>
                        </button>
                        <button
                           type="button"
                           className="section-nav-button"
                           aria-label="Phần tiếp theo"
                           title="Phần tiếp theo"
                           disabled={activeSectionIdx >= sections.length - 1}
                           onClick={() =>
                              setActiveSectionIdx((idx) =>
                                 Math.min(sections.length - 1, idx + 1)
                              )
                           }
                        >
                           <span className="material-symbols-outlined">
                              chevron_right
                           </span>
                        </button>
                     </div>
                  </div>

                  {currentSection?.type === 'exercise' ? (
                     <div className="interactive-section">
                        {currentResult?.gaveUp && (
                           <div className="give-up-solution-banner">
                              <span className="material-symbols-outlined">
                                 lightbulb
                              </span>
                              <div className="banner-text">
                                 <strong>Đáp án đã được mở</strong>
                                 <p>
                                    Bạn đã chọn xem đáp án cho câu hỏi này. Hãy xem đáp án đúng và lời giải chi tiết để ôn lại kiến thức nhé.
                                 </p>
                              </div>
                           </div>
                        )}
                        {currentSection.exercise?.type === 'mcq_single' && (
                           <div className="quiz-options-list">
                              {(
                                 currentSection.exercise?.payload?.options || []
                              ).map((opt) => {
                                 const isSelected =
                                    userAnswers[activeSectionIdx] === opt.id;
                                 const isSolution =
                                    Boolean(currentResult?.gaveUp) &&
                                    currentResult?.solution?.correctAnswer === opt.id;
                                 return (
                                    <label
                                       key={opt.id}
                                       className={`option-card-label ${isSelected ? 'selected' : ''} ${isSolution ? 'is-solution' : ''}`}
                                       onClick={() => {
                                          if (!currentResult?.gaveUp && !currentResult?.isCorrect) {
                                             handleSelectOption(opt.id);
                                          }
                                       }}
                                    >
                                       <div className="card-inner">
                                          <span className={`check-circle ${isSolution ? 'solution-circle' : ''}`}>
                                             {isSolution || isSelected ? '✓' : ''}
                                          </span>
                                          <div className="option-text">
                                             <LatexMarkdown
                                                content={opt.label || ''}
                                             />
                                          </div>
                                          {isSolution && (
                                             <span className="badge-solution-tag">
                                                Đáp án đúng
                                             </span>
                                          )}
                                       </div>
                                    </label>
                                 );
                              })}
                           </div>
                        )}

                        {currentSection.exercise?.type === 'mcq_multiple' && (
                           <div className="quiz-options-list">
                              {(
                                 currentSection.exercise?.payload?.options || []
                              ).map((opt) => {
                                 const selectedList =
                                    userAnswers[activeSectionIdx] || [];
                                 const isSelected = selectedList.includes(
                                    opt.id
                                 );
                                 const isSolution =
                                    Boolean(currentResult?.gaveUp) &&
                                    Array.isArray(currentResult?.solution?.correctAnswers) &&
                                    currentResult.solution.correctAnswers.includes(opt.id);
                                 return (
                                    <label
                                       key={opt.id}
                                       className={`option-card-label ${isSelected ? 'selected' : ''} ${isSolution ? 'is-solution' : ''}`}
                                       onClick={() => {
                                          if (!currentResult?.gaveUp && !currentResult?.isCorrect) {
                                             handleToggleMultipleOption(opt.id);
                                          }
                                       }}
                                    >
                                       <div className="card-inner">
                                          <span
                                             className={`check-circle ${isSolution ? 'solution-circle' : ''}`}
                                             style={{ borderRadius: '0.25rem' }}
                                          >
                                             {isSolution || isSelected ? '✓' : ''}
                                          </span>
                                          <div className="option-text">
                                             <LatexMarkdown
                                                content={opt.label || ''}
                                             />
                                          </div>
                                          {isSolution && (
                                             <span className="badge-solution-tag">
                                                Đáp án đúng
                                             </span>
                                          )}
                                       </div>
                                    </label>
                                 );
                              })}
                           </div>
                        )}

                        {currentSection.exercise?.type === 'fill_blank' &&
                           (() => {
                              const blanks = currentSection.exercise?.payload
                                 ?.blanks?.length
                                 ? currentSection.exercise.payload.blanks
                                 : [
                                      {
                                         id: 'blank_1',
                                         label:
                                            currentSection.exercise?.payload
                                               ?.label || 'Đáp số',
                                         placeholder:
                                            currentSection.exercise?.payload
                                               ?.placeholder ||
                                            'Nhập kết quả số hoặc đáp án...',
                                         unit:
                                            currentSection.exercise?.payload
                                               ?.unit || '',
                                      },
                                   ];

                              const answersForSection =
                                 typeof currentAnswer === 'object' &&
                                 !Array.isArray(currentAnswer) &&
                                 currentAnswer !== null
                                    ? currentAnswer
                                    : typeof currentAnswer === 'string'
                                      ? {
                                           [blanks[0]?.id || 'blank_1']:
                                              currentAnswer,
                                        }
                                      : {};

                              return (
                                 <div className="fill-blanks-group">
                                    {blanks.map((blank, idx) => {
                                       const bId =
                                          blank.id || `blank_${idx + 1}`;
                                       const val = answersForSection[bId] ?? '';
                                       return (
                                          <div
                                             key={bId}
                                             className="fill-blank-card-item"
                                          >
                                             <div className="fb-label-row">
                                                <span className="fb-number-tag">
                                                   {idx + 1}
                                                </span>
                                                <div className="fb-label-content">
                                                   <LatexMarkdown
                                                      content={
                                                         blank.label ||
                                                         `Đáp số ${idx + 1}`
                                                      }
                                                   />
                                                </div>
                                             </div>
                                             <div className="fb-input-wrapper">
                                                <input
                                                   type="text"
                                                   placeholder={
                                                      blank.placeholder ||
                                                      'Nhập kết quả số hoặc đáp án...'
                                                   }
                                                   value={
                                                      currentResult?.gaveUp
                                                         ? (currentResult?.solution?.blanks?.find((b) => b.id === bId)?.exactValue ?? currentResult?.solution?.exactValue ?? val)
                                                         : val
                                                   }
                                                   onChange={(e) =>
                                                      handleFillBlankChange(
                                                         bId,
                                                         e.target.value
                                                      )
                                                   }
                                                   disabled={Boolean(
                                                      currentResult?.isCorrect || currentResult?.gaveUp
                                                   )}
                                                />
                                                {blank.unit && (
                                                   <span className="unit-badge">
                                                      {blank.unit}
                                                   </span>
                                                )}
                                             </div>
                                             {currentResult?.gaveUp && (
                                                <div className="fb-solution-hint">
                                                   <span className="badge-solution-tag">Đáp án đúng</span>
                                                   <span className="fb-solution-val">
                                                      {currentResult?.solution?.blanks?.find((b) => b.id === bId)?.exactValue ?? currentResult?.solution?.exactValue ?? ''}
                                                   </span>
                                                </div>
                                             )}
                                          </div>
                                       );
                                    })}
                                 </div>
                              );
                           })()}
                     </div>
                  ) : (
                     /* When section is Theory (doc) */
                     <div className="interactive-section">
                        <div className="question-title-wrap">
                           <h3 className="question-title">
                              Nội dung lí thuyết
                           </h3>
                           <p className="question-subtitle">
                              Đọc kĩ phần trình bày lí thuyết bên cạnh để chuẩn
                              bị cho phần bài tập vận dụng tiếp theo.
                           </p>
                        </div>
                     </div>
                  )}

                  {/* Bottom CTA Forward Button */}
                  <div className="cta-next-wrap">
                     {currentResult && !currentResult.isCorrect && (
                        <button
                           type="button"
                           className={`btn-give-up ${isHoldingGiveUp ? 'holding' : ''}`}
                           aria-label="Nhấn giữ để bỏ cuộc"
                           title="Nhấn giữ để bỏ cuộc"
                           onPointerDown={(event) => {
                              if (event.button === 0) startGiveUpHold();
                           }}
                           onPointerUp={cancelGiveUpHold}
                           onPointerLeave={cancelGiveUpHold}
                           onPointerCancel={cancelGiveUpHold}
                           onKeyDown={(event) => {
                              if (event.key === ' ' || event.key === 'Enter') {
                                 event.preventDefault();
                                 startGiveUpHold();
                              }
                           }}
                           onKeyUp={(event) => {
                              if (event.key === ' ' || event.key === 'Enter')
                                 cancelGiveUpHold();
                           }}
                           onBlur={cancelGiveUpHold}
                           onContextMenu={(event) => event.preventDefault()}
                        >
                           <span
                              className="material-symbols-outlined"
                              aria-hidden="true"
                           >
                              flag
                           </span>
                        </button>
                     )}
                     <button
                        type="button"
                        className={
                           isCheckingAnswer
                              ? 'btn-check-answer'
                              : 'btn-next-step'
                        }
                        onClick={
                           isCheckingAnswer
                              ? handleSubmitExercise
                              : handleNextStep
                        }
                        disabled={
                           isCheckingAnswer && (submitting || !hasAnswer)
                        }
                     >
                        <span className="material-symbols-outlined">
                           {isCheckingAnswer
                              ? currentResult && !currentResult.isCorrect
                                 ? 'replay'
                                 : 'verified'
                              : currentResult?.isCorrect
                                ? 'check_circle'
                                : 'arrow_forward'}
                        </span>
                        <span>
                           {isCheckingAnswer
                              ? submitting
                                 ? 'Đang chấm điểm...'
                                 : currentResult && !currentResult.isCorrect
                                   ? 'Chưa chính xác · Thử lại'
                                   : 'Kiểm tra đáp án'
                              : `${currentResult?.isCorrect ? 'Chính xác! ' : ''}${isLastSection ? 'Hoàn thành bài học' : 'Tiếp tục'}`}
                        </span>
                     </button>
                  </div>
               </div>
            </main>
         </div>
      </div>
   );
}
