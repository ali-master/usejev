import type {Demo} from './demos';

export type Language = 'en' | 'fa';
const persian: Record<string, string> = {
  "All demos": "همهٔ دموها",
  "Customer": "مشتریان",
  "Content": "محتوا",
  "Business": "کسب‌وکار",
  "Engineering": "مهندسی",
  "No demos found. Try another search.": "دمویی پیدا نشد. عبارت دیگری جست‌وجو کنید.",
  "Model connected": "مدل متصل است",
  "Model offline": "مدل در دسترس نیست",
  "Connecting…": "در حال اتصال…",
  "Demo library": "کتابخانهٔ دموها",
  "THE DEMO LIBRARY": "کتابخانهٔ دموها",
  "Find a use case…": "جست‌وجوی کاربرد…",
  "Search demos": "جست‌وجوی دموها",
  "Filter by category": "فیلتر دسته‌بندی",
  "Local by design": "اجرا روی دستگاه شما",
  "Your inputs stay on your machine.": "ورودی‌ها روی دستگاه شما می‌مانند.",
  "Open demo library": "باز کردن کتابخانهٔ دموها",
  "Workspace": "فضای کار",
  "Playground": "آزمایشگاه",
  "Refresh connection": "بررسی دوبارهٔ اتصال",
  "Toggle color theme": "تغییر حالت روشن و تیره",
  "Model card": "معرفی مدل",
  "Workspace views": "بخش‌های فضای کار",
  "Session history": "تاریخچهٔ نشست",
  "How it works": "راهنمای استفاده",
  "Edit the schema below to fix invalid JSON.": "برای اصلاح JSON نامعتبر، ساختار زیر را ویرایش کنید.",
  "Input editor": "ویرایشگر ورودی",
  "Give it context": "زمینه را مشخص کنید",
  "Reset this demo": "بازنشانی این دمو",
  "INPUT STATE": "متن ورودی",
  "Text": "متن",
  "Input state": "ورودی مدل",
  "characters": "نویسه",
  "Try another example": "امتحان نمونهٔ دیگر",
  "What do you want to know?": "چه چیزی می‌خواهید بدانید؟",
  "TYPED QUESTIONS": "پرسش‌های ساختاریافته",
  "Edit question schema": "ویرایش ساختار پرسش‌ها",
  "Question schema JSON": "ساختار JSON پرسش‌ها",
  "Making decisions…": "در حال ارزیابی…",
  "Run inference": "اجرای مدل",
  "Cancel": "لغو",
  "One forward pass. No text generation.": "یک بار پردازش؛ بدون تولید متن.",
  "CONNECTING THE DOTS": "در حال بررسی ارتباط‌ها",
  "READY WHEN YOU ARE": "آمادهٔ آزمایش شما",
  "A little context. A clear answer.": "کمی زمینه؛ پاسخی روشن.",
  "Let’s make a decision.": "بیایید تصمیم بگیریم.",
  "Laya is evaluating your questions locally. Your real results will appear here.": "لایا پرسش‌های شما را روی دستگاه ارزیابی می‌کند. نتایج واقعی اینجا نمایش داده می‌شوند.",
  "Choose a demo, make the input your own, and see what Laya thinks.": "یک دمو انتخاب کنید، ورودی را تغییر دهید و ارزیابی لایا را ببینید.",
  "PROBABILITY OF TRUE": "احتمال درست بودن",
  "Leaning yes": "متمایل به بله",
  "Leaning no": "متمایل به خیر",
  "Yes": "بله",
  "No": "خیر",
  "probability": "احتمال",
  "Expected score": "امتیاز مورد انتظار",
  "Entropy confidence": "اطمینان بر پایهٔ آنتروپی",
  "1 − normalized entropy. This is not the winning-label probability or a guarantee of correctness.": "یک منهای آنتروپی نرمال‌شده؛ این عدد احتمال گزینهٔ منتخب یا تضمین درستی پاسخ نیست.",
  "Model results": "نتایج مدل",
  "See the decision": "ارزیابی مدل را ببینید",
  "Visual": "نمودار",
  "INFERENCE COMPLETE": "ارزیابی کامل شد",
  "Input changed. Run again to refresh these results.": "ورودی تغییر کرده است. برای به‌روزرسانی نتایج دوباره اجرا کنید.",
  "input tokens": "توکن ورودی",
  "Copy JSON": "کپی JSON",
  "THE SYSTEM 1 PLAYGROUND": "آزمایشگاه سیستم ۱",
  "Less guessing.<br>More <em>knowing.</em>": "حدس کمتر.<br><em>شناخت بیشتر.</em>",
  "Real-world questions. Typed answers. One forward pass.<br>Discover what a decision model can do.": "پرسش‌های واقعی. پاسخ‌های ساختاریافته. یک بار پردازش.<br>کاربردهای یک مدل تصمیم‌گیری را کشف کنید.",
  "Context": "زمینه",
  "16 use cases": "۱۶ کاربرد",
  "3 answer types": "۳ نوع پاسخ",
  "DEMO": "دمو",
  "Get the code": "دریافت کد",
  "Explore, don’t assume. Outputs are model estimates. Validate them for your use case.": "آزمایش کنید؛ خروجی‌ها تخمین مدل هستند. درستی آن‌ها را برای کاربرد خود بسنجید.",
  "English checkpoint · Persian examples are experimental.": "مدل انگلیسی · نمونه‌های فارسی آزمایشی هستند",
  "KEEP EXPLORING": "بیشتر کشف کنید",
  "A different question. A new possibility.": "پرسشی متفاوت؛ امکانی تازه.",
  "YOUR SESSION": "نشست شما",
  "A trail of decisions.": "مسیر ارزیابی‌های شما.",
  "Compare your experiments. History stays in this tab and disappears when you reload.": "آزمایش‌ها را مقایسه کنید. تاریخچه در همین برگه می‌ماند و با بارگذاری دوباره پاک می‌شود.",
  "runs": "اجرا",
  "Clear history": "پاک کردن تاریخچه",
  "Your first experiment starts here.": "اولین آزمایش شما از اینجا شروع می‌شود.",
  "Run any demo to start your session history.": "با اجرای یک دمو، تاریخچهٔ نشست شما آغاز می‌شود.",
  "Explore the playground": "رفتن به آزمایشگاه",
  "A QUICK FIELD GUIDE": "راهنمای کوتاه",
  "Decisions, not conversations.": "مدلی برای تصمیم‌گیری.",
  "Laya evaluates your context against questions you define. It returns structured decisions and probabilities, without generating text.": "لایا زمینهٔ ورودی را با پرسش‌های شما ارزیابی می‌کند و بدون تولید متن، تصمیم‌های ساختاریافته و احتمال‌ها را برمی‌گرداند.",
  "Pick a direction": "یک مسیر انتخاب کنید",
  "Define named options. Get a selected label and a probability for every option. Useful for routing, categories, and intent.": "گزینه‌ها را تعریف کنید و گزینهٔ منتخب و احتمال هر گزینه را بگیرید. مناسب مسیریابی، دسته‌بندی و تشخیص قصد.",
  "Find its place on a scale": "جایگاه را روی مقیاس بسنجید",
  "Define an ordered rubric, starting at zero. The output is an expected score and can sit between levels.": "یک معیار مرتب از صفر تعریف کنید. خروجی امتیاز مورد انتظار است و می‌تواند بین دو سطح قرار بگیرد.",
  "Ask a yes-or-no question": "پرسش بله یا خیر بپرسید",
  "Get the probability that a statement is true, from 0 to 1. A 0.8 is an estimate, not a guarantee.": "احتمال درست بودن یک گزاره را از صفر تا یک دریافت کنید. عدد ۰٫۸ یک تخمین است و تضمین نیست.",
  "Know what the numbers mean.": "معنای عددها را بشناسید.",
  "Choice and score confidence measure how concentrated the distribution is (1 − normalized entropy). They are not accuracy scores. The selected-label probability is shown separately. This playground does not take actions on your behalf.": "اطمینان در choice و score میزان تمرکز توزیع را می‌سنجد (یک منهای آنتروپی نرمال‌شده)، نه دقت پاسخ را. احتمال گزینهٔ منتخب جداگانه نمایش داده می‌شود. این آزمایشگاه اقدامی از طرف شما انجام نمی‌دهد.",
  "An English model, for now.": "فعلاً با مدل انگلیسی.",
  "The loaded checkpoint is English. Persian examples send Persian text and questions directly to it; Persian accuracy is not verified. For multilingual use, load and evaluate a multilingual checkpoint separately. Long inputs are truncated to the model’s token budget.": "مدل بارگذاری‌شده انگلیسی است. نمونه‌های فارسی، متن و پرسش‌ها را مستقیماً به فارسی به مدل می‌فرستند؛ دقت فارسی تأیید نشده است. برای کاربرد چندزبانه، مدل چندزبانه را جداگانه بارگذاری و ارزیابی کنید. ورودی‌های طولانی تا سقف توکن مدل کوتاه می‌شوند.",
  "Take this experiment with you.": "کد این آزمایش را بردارید.",
  "Close dialog": "بستن پنجره",
  "Run on your server with Bun or Node.js.": "با Bun یا Node.js روی سرور خود اجرا کنید.",
  "Copy code": "کپی کد",
  "Built for curious minds.": "برای ذهن‌های کنجکاو.",
  "Local inference. Real possibilities.": "پردازش محلی. امکان‌های واقعی.",
  "Add some context before running the model.": "پیش از اجرای مدل، متنی وارد کنید.",
  "Invalid JSON. Check the input and question schema.": "JSON نامعتبر است. ورودی و ساختار پرسش‌ها را بررسی کنید.",
  "Inference failed.": "اجرای مدل ناموفق بود.",
  "The request timed out. Please try again.": "زمان درخواست به پایان رسید. دوباره تلاش کنید.",
  "Something went wrong.": "خطایی رخ داد.",
  "Copied to clipboard": "کپی شد",
  "Clipboard unavailable. Select and copy the text manually.": "کپی خودکار در دسترس نیست. متن را انتخاب و دستی کپی کنید."
};

const persianDemos: Record<string, Pick<Demo, 'title' | 'description' | 'context'>> = {
  "inbox": {
    "title": "دسته‌بندی پیام‌ها",
    "description": "هر پیام، برای تیم مناسب.",
    "context": "در یک مرحله درخواست‌ها را مسیریابی کنید، فوریت را بسنجید و درخواست بازپرداخت را تشخیص دهید."
  },
  "sentiment": {
    "title": "تحلیل نظرات",
    "description": "فراتر از امتیاز ستاره‌ای بشنوید.",
    "context": "احساس، رضایت و نشانه‌های مرتبط با محصول را از نظر مشتری استخراج کنید."
  },
  "churn": {
    "title": "نشانه‌های ریزش",
    "description": "پیش از خداحافظی، گفتگو را دریابید.",
    "context": "قصد لغو اشتراک و دلیل احتمالی ترک مشتری را شناسایی کنید."
  },
  "intent": {
    "title": "تشخیص قصد کاربر",
    "description": "درخواست را مستقیم درک کنید.",
    "context": "گام بعدی را برای پشتیبانی گفتگومحور انتخاب کنید."
  },
  "moderation": {
    "title": "بررسی محتوا",
    "description": "نگاهی پیش از انتشار.",
    "context": "نشانه‌های هرزنامه و آزار را بررسی کنید. این‌ها تخمین مدل هستند، نه سیاست اجرایی."
  },
  "news": {
    "title": "دسته‌بندی اخبار",
    "description": "برای هر خبر، جای مناسب.",
    "context": "خبرها را بر اساس موضوع مرتب کنید و گزارش رویدادهای تازه را تشخیص دهید."
  },
  "emotion": {
    "title": "تشخیص احساس",
    "description": "احساس پشت واژه‌ها را بخوانید.",
    "context": "لحن احساسی و شدت آن را در نوشته‌های روزمره بررسی کنید."
  },
  "readiness": {
    "title": "آمادگی انتشار",
    "description": "یک بررسی دقیق دیگر.",
    "context": "پیش از انتشار، دعوت به اقدام و بخش‌های ناتمام متن را بررسی کنید."
  },
  "leads": {
    "title": "ارزیابی سرنخ فروش",
    "description": "گفتگوهای ارزشمند را پیدا کنید.",
    "context": "قصد خرید فعال را از تحقیق اولیه جدا کنید، بدون حدس زدن اطلاعات ناموجود."
  },
  "invoice": {
    "title": "بررسی فاکتور",
    "description": "جزئیاتی که نیاز به بررسی دارند.",
    "context": "پیام‌های فاکتور و استثناهای صریح را برای بررسی دسته‌بندی کنید. هیچ پرداختی انجام نمی‌شود."
  },
  "feedback": {
    "title": "مسیریابی بازخورد",
    "description": "بازخورد، نقطهٔ شروع بهبود.",
    "context": "پیشنهادهای محصول را از گزارش خطا جدا و بخش مرتبط را مشخص کنید."
  },
  "meeting": {
    "title": "پیگیری جلسه",
    "description": "گفتگو بود یا تصمیم؟",
    "context": "وجود تصمیم، مسئول مشخص و مهلت انجام را در یادداشت‌های جلسه بررسی کنید."
  },
  "incident": {
    "title": "بررسی رخداد",
    "description": "پاسخی روشن‌تر به هشدارها.",
    "context": "هشدار عملیاتی را بر اساس بخش آسیب‌دیده و اثر گزارش‌شده دسته‌بندی کنید."
  },
  "injection": {
    "title": "بررسی تزریق پرامپت",
    "description": "دستورهای پنهان در ورودی را بیابید.",
    "context": "نشانه‌های احتمالی تزریق پرامپت را بررسی کنید. این دمو یک سد امنیتی کامل نیست."
  },
  "bug": {
    "title": "کیفیت گزارش خطا",
    "description": "جزئیات بیشتر برای بازتولید خطا.",
    "context": "بررسی کنید گزارش خطا اطلاعات کافی برای شروع بررسی دارد یا نه."
  },
  "agent": {
    "title": "ارجاع عامل هوشمند",
    "description": "زمان ورود انسان را تشخیص دهید.",
    "context": "پیش از انتخاب اجرای خودکار یا بررسی انسانی، شرح کار را ارزیابی کنید."
  }
};

export function translate(text: string, language: Language): string {
  return language === 'fa' ? persian[text] ?? text : text;
}

export function localizeDemo(demo: Demo, language: Language) {
  return language === 'fa' ? persianDemos[demo.id] ?? demo : demo;
}
