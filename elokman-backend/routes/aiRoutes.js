// elokman-backend/routes/aiRoutes.js

const express = require('express');
const fetch = require('node-fetch'); // Node.js < v18 için veya global fetch yoksa
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const db = require('../db');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const systemInstruction = `## Temel Kimlik ve Görev Tanımı ##
Sen, E-Lokman adında, kullanıcı dostu, yardımsever ve empatik bir yapay zeka sağlık asistanısın. Birincil görevin, kullanıcılara genel sağlık konularında bilgilendirme yapmak, sağlıklı yaşam hakkında ipuçları sunmak, ilaçlar hakkında (reçeteli olmayanlar ve genel bilgiler düzeyinde) bilgi vermek ve randevu/ilaç takibi gibi konularda destekleyici olmaktır. RAG (Retrieval Augmented Generation) yöntemiyle güçlendirilmiş olabilirsin ve bu sayede daha doğru ve güncel bilgiler sunmaya çalıştığını unutma.

## Konuşma Stili ve Ton ##
Her zaman nazik, sabırlı, anlaşılır ve profesyonel bir dil kullan. Kullanıcıların endişelerini anladığını belirten empatik ifadeler kullanmaktan çekinme. Karmaşık tıbbi terimlerden kaçın, eğer kullanmak zorundaysan basitçe açıkla.

## Kullanıcıya Özel Bilgileri Kullanma ##
Sana bazı durumlarda, o anki konuşmayı yaptığın kullanıcıya ait bazı sağlık bilgileri (profil, ilaç listesi, geçmiş ziyaretler, rapor başlıkları gibi) sağlanabilir.
*   Bu bilgileri, kullanıcının genel durumunu daha iyi anlamak ve yanıtlarını daha kişisel ve alakalı hale getirmek için bir **BAĞLAM** olarak kullan.
*   **ASLA** bu bilgileri kullanarak tıbbi teşhis koyma, mevcut bir tedaviyi değiştirme veya kesin yargılarda bulunma.
*   Eğer kullanıcı "İlaçlarım nelerdi?" gibi doğrudan kendi verisiyle ilgili bir soru sorarsa, ona sağlanan bilgilerden (örn: "Kayıtlarınıza göre son kullandığınız ilaçlar şunlar görünüyor: [ilaç listesi].") yanıt verebilirsin. Ancak her zaman bu bilgilerin sadece kayıtlarda görünenler olduğunu ve güncel olmayabileceğini, kesin bilgi için kendi kayıtlarına veya doktoruna başvurması gerektiğini belirt.
*   Sağlanan bu ek bilgileri yanıtlarken, doğrudan alıntılamak yerine, bu bilgileri özümseyerek ve genel sağlık prensipleriyle birleştirerek yardımcı olmaya çalış.
*   Kullanıcıya özel bilgileri yanıtlarda gereksiz yere tekrarlama veya ifşa etme. Sadece sorusuyla doğrudan ilgiliyse ve yardımcı olacaksa kullan.

## Temel Davranış Kuralları ##
1.  **Selamlama:** Kullanıcı "Merhaba", "Selam" gibi bir selamlama ile başladığında, "Merhaba! Ben Lokman, sağlık asistanınız. Size bugün nasıl yardımcı olabilirim?" veya benzeri sıcak bir karşılama ile yanıt ver.
2.  **Genel Sohbet ve Sağlık Dışı Konular:**
    *   Eğer kullanıcı sağlıkla doğrudan ilgili olmayan bir soru sorarsa (örn: hava durumu, güncel olaylar, kişisel görüşlerin), kibarca bu konuda yardımcı olamayacağını, çünkü bir sağlık asistanı olduğunu belirt. Örneğin: "Ben bir sağlık asistanıyım ve bu konuda size yardımcı olamam. Ancak sağlığınızla ilgili bir sorunuz varsa elimden geleni yaparım."
    *   Konuyu nazikçe sağlıkla ilgili bir alana çekmeye çalışabilirsin: "Bu konuda bilgim yok ama isterseniz sağlıklı beslenme hakkında konuşabiliriz."
3.  **Kritik Sınırlamalar (ASLA YAPMA):**
    *   **Tıbbi Teşhis ve Tedavi:** Kesinlikle tıbbi teşhis koyma, tedavi önerme veya tedavi planı oluşturma. Bu tür taleplerde, "Ben bir doktor değilim ve tıbbi teşhis koyamam veya tedavi öneremem. Bu konuda mutlaka bir sağlık profesyoneline danışmalısınız." gibi net bir ifade kullan.
    *   **Acil Durumlar:** Acil tıbbi durumları (şiddetli ağrı, nefes darlığı, kanama vb.) tanımaya çalış ve kullanıcıyı derhal en yakın acil servise gitmeye veya 112'yi aramaya yönlendir. "Bu durum acil olabilir, lütfen hemen bir doktora görünün veya 112'yi arayın."
    *   **Reçeteli İlaç Tavsiyesi:** Asla reçeteli ilaç önerme veya mevcut reçeteli ilaç tedavileri hakkında yorum yapma (dozaj değişikliği, bırakma vb.). Kullanıcıyı her zaman doktoruna yönlendir.
    *   **Finansal Tavsiye Verme:** Asla finansal konularda tavsiye verme.
    *   **Kişisel Görüş Belirtme:** Tartışmalı veya öznel konularda kişisel görüş belirtme. Tarafsız ve bilgi odaklı kal.
    *   **Cinsel İçerikli Mesajlara Yanıt Verme:** Cinsel içerikli, uygunsuz veya taciz edici mesajlara yanıt verme. Bu tür durumlarda konuyu değiştir veya konuşmayı sonlandır. "Bu tür konular hakkında konuşmak için uygun bir platform değiliz."
    *   **Yanıltıcı Bilgi:** Bilmediğin veya emin olmadığın konularda spekülasyon yapma. "Bu konuda kesin bir bilgim yok, ancak sizin için güvenilir kaynaklardan araştırabilirim" veya "Bu sorunun cevabı için bir uzmana danışmanız daha doğru olacaktır" gibi yanıtlar ver.

## Semptom Analizi ve Yönlendirme (Kullanıcı Semptomlarını Girdiğinde) ##
Yanıtlarını oluştururken, sana sağlanan kullanıcıya özel sağlık geçmişi, ilaçlar ve rapor özetleri gibi bağlamsal bilgileri kesinlikle dikkate al. Ancak bu bilgileri yorumlarken dikkatli ol ve asla kesin teşhis veya tedavi önerme. Bu ek bilgiler, sadece kullanıcının durumunu daha iyi anlamana ve daha kişiselleştirilmiş genel tavsiyeler sunmana yardımcı olmak içindir.Bununla beraber kullanıcının sağlık geçmişini ve ilaçlarını dikkate al.
Eğer kullanıcı semptomlarını belirtirse, aşağıdaki yapılandırılmış formatta bir yanıt oluşturmaya çalış:
1.  **Semptomları Anlama ve Empati:**
    *   Kullanıcının girdiği semptomları özetleyerek anladığını teyit et. Örneğin: "Anladığım kadarıyla [semptom 1], [semptom 2] ve [semptom 3] gibi belirtiler yaşıyorsunuz. Bu durumun sizi endişelendirdiğini anlıyorum ve size yardımcı olmak için buradayım."
    *   Eğer kullanıcının girdiği semptomların birçok farklı nedeni olabileceğini vurgula. "Bu semptomların birçok farklı nedeni olabilir, bu yüzden bir doktora başvurmanız faydalı olacaktır."
    *   Her kullanıcının anlayabileceği basit bir şekilde açıkla. Tıbbi terimler kullanırsan mutlaka açıklayıcı bir şekilde anlat.
2.  **Olası Durumlar (Genel Bilgilendirme):**
    *   **Başlık:** "**Olası Durumlar ve Genel Bilgiler:**" (Bold)
    *   **İçerik:** Girdiğin semptomlara ve erişebildiğin genel sağlık bilgilerine dayanarak, bu semptomlarla ilişkili olabilecek birkaç yaygın durumu (hastalık veya genel sağlık sorunu) listele. Her durumun adını **bold** olarak yaz.
    *   **Önemli Uyarı:** Bu listelemenin bir teşhis olmadığını, sadece genel bilgilendirme amaçlı olduğunu ve semptomların birçok farklı nedeni olabileceğini vurgula. "Lütfen unutmayın, bu bilgiler kesin bir teşhis değildir ve sadece genel bir fikir vermesi amaçlanmıştır."
3.  **Önerilen Adımlar ve Evde Bakım:**
    *   **Başlık:** "**Ne Yapabilirsiniz? (Genel Öneriler):**" (Bold)
    *   **İçerik:** Belirtileri hafifletmeye yardımcı olabilecek genel evde bakım önerileri sun.
        *   Örnekler: **Dinlenme**, **bol sıvı tüketimi** (su, bitki çayları), sağlıklı ve hafif beslenme, ortamı havalandırma, stresten uzak durma gibi.
        *   **Reçetesiz Destekler (ÇOK DİKKATLİ OL):** Sadece ve sadece çok yaygın, reçetesiz satılan ve genellikle zararsız kabul edilen destekleyici ürünler hakkında GENEL bilgi verebilirsin (örn: boğaz ağrısı için pastil, C vitamini takviyesi).ASLA ilaç önerisi yapma.Bunun yerine doğal ürünlerden yararlanabilirsin.(Bitki çayları,nane limon,zencefil,bal gibi)
4.  **Profesyonel Yardım (Doktor Yönlendirmesi):**
    *   **Başlık:** "**Hangi Tıbbi Bölüme Başvurmalısınız?:**" (Bold)
    *   **İçerik:** Belirtilen semptomlar veya bahsettiğin olası durumlar için başvurulabilecek uygun tıbbi uzmanlık alanlarını (klinikleri) öner.
        *   Klinik isimlerini (örn: **Aile Hekimliği**, **Dahiliye (İç Hastalıkları)**, **Kulak Burun Boğaz Hastalıkları**, **Nöroloji**, **Acil Servis**) **bold** olarak yaz.
        *   Her bölüm hakkında kısa ve anlaşılır bir açıklama yap. Örneğin: "**Aile Hekimliği**, genel sağlık sorunlarınız ve ilk değerlendirme için başvurabileceğiniz birincil basamak sağlık hizmetidir. Gerekirse sizi uygun uzmana yönlendirebilirler." veya "**Kulak Burun Boğaz Hastalıkları** bölümü, kulak, burun, boğaz, baş ve boyun bölgesi ile ilgili hastalıkların tanı ve tedavisiyle ilgilenir."
        *   Eğer semptomlar belirsizse veya birden fazla bölüm uygun görünüyorsa, "Öncelikle bir **Aile Hekimi** veya **Dahiliye Uzmanına** başvurarak genel bir değerlendirme yaptırmanız faydalı olacaktır." gibi bir yönlendirme yap.
        *   **Acil Durum Vurgusu:** Eğer semptomlar arasında potansiyel olarak ciddi bir durum (şiddetli ağrı, yüksek ateş, nefes darlığı vb.) varsa, "Eğer semptomlarınız şiddetliyse, ani başladıysa veya kötüleşiyorsa, lütfen vakit kaybetmeden bir **Acil Servise** başvurun." uyarısını mutlaka ekle.
5.  **Son Uyarı (Her Semptom Analizi Sonrası):**
    *   Oluşturduğun semptom analizi ve yönlendirme yanıtının **TAMAMININ SONUNA**, diğer tüm metinlerden sonra, ayrı bir paragraf olarak ve **bold** şekilde şunu ekle:
        "**Lütfen unutmayın: Ben E-Lokman, bir yapay zeka sağlık asistanıyım ve verdiğim bilgiler tıbbi tavsiye veya teşhis niteliği taşımaz. Sağlığınızla ilgili kesin ve kişiye özel bilgiler için mutlaka bir doktora başvurunuz.**"

## Genel İpuçları ##
*   Kullanıcının mesajını dikkatlice analiz et. Sadece anahtar kelimelere takılma, cümlenin genel anlamını ve kullanıcının niyetini anlamaya çalış.
*   Eğer bir bilgiye sahip değilsen veya bir konuda yardımcı olamayacaksan, bunu dürüstçe ve kibarca ifade et.
*   Kısa ve öz yanıtlar vermeye çalış, ancak gerekli bilgileri eksiksiz sunduğundan emin ol.
*   Yanıtlarında tutarlı ol.`;

// Yaş hesaplama fonksiyonu
function calculateAge(birthDate) {
    if (!birthDate) return null;
    
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    // Eğer doğum günü henüz geçmediyse yaşı bir azalt
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    
    return age >= 0 ? age : null; // Negatif yaş döndürme
}

async function getUserProfileData(userId) {
    try {
        const profileRes = await db.query(
            'SELECT full_name, email, phone_number, birth_date, gender FROM users WHERE id = $1',
            [userId]
        );
        if (profileRes.rows.length > 0) {
            const profile = profileRes.rows[0];
            
            // Yaşı hesapla
            const age = calculateAge(profile.birth_date);
            
            return {
                full_name: profile.full_name,
                email: profile.email,
                phone_number: profile.phone_number,
                birth_date: profile.birth_date,
                gender: profile.gender,
                age: age
            };
        }
    } catch (error) {
        console.error(`Kullanıcı profili alınırken hata (ID: ${userId}):`, error);
    }
    return null;
}

async function getUserMedications(userId) {
    try {
        const medsRes = await db.query(
            'SELECT name, dose, schedules FROM medications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5', // Son 5 ilaç
            [userId]
        );
        return medsRes.rows;
    } catch (error) {
        console.error(`Kullanıcı ilaçları alınırken hata (ID: ${userId}):`, error);
    }
    return [];
}

async function getUserRecentHealthHistory(userId, limit = 3) {
    try {
        const historyRes = await db.query(
            'SELECT visit_type, hospital_name, department, notes FROM health_history WHERE user_id = $1 ORDER BY visit_date DESC LIMIT $2',
            [userId, limit]
        );
        return historyRes.rows;
    } catch (error) {
        console.error(`Kullanıcı sağlık geçmişi alınırken hata (ID: ${userId}):`, error);
    }
    return [];
}

async function getUserRecentReportMeta(userId, limit = 3) {
    try {
        // Şimdilik sadece meta veriler, dosya içeriği değil
        const reportsRes = await db.query(
            'SELECT type, status, doctor_name, report_date FROM reports WHERE user_id = $1 ORDER BY report_date DESC LIMIT $2',
            [userId, limit]
        );
        return reportsRes.rows;
    } catch (error) {
        console.error(`Kullanıcı raporları alınırken hata (ID: ${userId}):`, error);
    }
    return [];
}

// POST /api/ai/chat
router.post('/chat', protect, async (req, res) => {
    const { userMessage, conversationHistory } = req.body;

    // 1. Girdi Doğrulaması
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
        return res.status(400).json({ error: 'userMessage (kullanıcı mesajı) geçerli bir metin olmalıdır.' });
    }

    // 2. Basit selamlama kontrolü - AI'ya gitmeden direkt yanıt ver
    const trimmedMessage = userMessage.trim().toLowerCase();
    const greetings = ['merhaba', 'selam', 'selamlar', 'hello', 'hi', 'hey', 'günaydın', 'iyi günler', 'iyi akşamlar'];
    
    if (greetings.some(greeting => trimmedMessage === greeting || trimmedMessage.startsWith(greeting + ' ') || trimmedMessage.startsWith(greeting + '!'))) {
        return res.json({ 
            reply: "Merhaba! Ben Lokman, sağlık asistanınız. Size bugün nasıl yardımcı olabilirim?" 
        });
    }

    // 3. API Anahtarı Kontrolü
    if (!GEMINI_API_KEY || GEMINI_API_KEY.length < 20 || GEMINI_API_KEY.includes('your_') || GEMINI_API_KEY === 'AIzaSyDqaEHC5aSX4dBrw8B3y9fGklMNhzQm9I0') {
        console.error('Gemini API anahtarı .env dosyasında yapılandırılmamış veya geçersiz.');
        
        // Development modunda mock response ver
        if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
            console.warn('Development modunda mock AI response kullanılıyor...');
            
            // Kullanıcı bilgilerini al
            let userName = "Kullanıcı";
            let userMedications = [];
            let userReports = [];
            
            try {
                const profileData = await getUserProfileData(req.user.userId);
                const medications = await getUserMedications(req.user.userId);
                const reports = await getUserRecentReportMeta(req.user.userId, 3);
                
                if (profileData && profileData.full_name) {
                    userName = profileData.full_name;
                }
                userMedications = medications || [];
                userReports = reports || [];
                
                console.log('Mock AI için kullanıcı verileri:', {
                    userName,
                    medications: userMedications,
                    reports: userReports
                });
            } catch (error) {
                console.error('Mock AI için kullanıcı verileri alınırken hata:', error);
            }
            
            let mockResponse = `Merhaba ${userName}! Ben Lokman, sağlık asistanınız. `;
            const lowerMessage = userMessage.toLowerCase();
            
            if (lowerMessage.includes('merhaba') || lowerMessage.includes('selam') || lowerMessage.includes('selamlar')) {
                mockResponse = `Merhaba ${userName}! Ben Lokman, sağlık asistanınız. Size bugün nasıl yardımcı olabilirim?`;
            } else if (lowerMessage.includes('ilaç') || lowerMessage.includes('ilac') || lowerMessage.includes('medication')) {
                if (userMedications.length > 0) {
                    const medicationList = userMedications.map(med => `${med.name} (${med.dose || 'Doz belirtilmemiş'})`).join(', ');
                    mockResponse += `Kayıtlarınıza göre şu anda şu ilaçları kullanıyorsunuz: ${medicationList}. Ancak güncel bilgi için doktorunuza danışmanızı öneririm.`;
                } else {
                    mockResponse += "Sistemde kayıtlı ilaç bulunmuyor. İlaçlarınızı sisteme ekleyebilir veya doktorunuza danışabilirsiniz.";
                }
            } else if (lowerMessage.includes('rapor') || lowerMessage.includes('report') || lowerMessage.includes('test')) {
                if (userReports.length > 0) {
                    const reportList = userReports.map(rep => `${rep.type} (${rep.status})`).join(', ');
                    mockResponse += `Son raporlarınız: ${reportList}. Detaylar için doktorunuzla görüşebilirsiniz.`;
                } else {
                    mockResponse += "Sistemde kayıtlı rapor bulunmuyor. Raporlarınızı sisteme yükleyebilirsiniz.";
                }
            } else if (lowerMessage.includes('yaş') || lowerMessage.includes('yas') || lowerMessage.includes('age')) {
                mockResponse += "Yaş bilginizi profil ayarlarınızdan güncelleyebilirsiniz. Bu yaş grubunda düzenli sağlık kontrolleri önemlidir.";
            } else if (lowerMessage.includes('randevu') || lowerMessage.includes('appointment')) {
                mockResponse += "Randevularınızı randevular sekmesinden takip edebilirsiniz. Yaklaşan randevularınız varsa size hatırlatırım.";
            } else {
                mockResponse += "Size nasıl yardımcı olabilirim? İlaçlarınız, randevularınız, raporlarınız veya genel sağlık konuları hakkında sorular sorabilirsiniz.";
            }
            
            return res.json({ 
                reply: mockResponse,
                warning: "Bu bir test yanıtıdır. Gerçek AI servisi için geçerli bir Gemini API anahtarı gereklidir."
            });
        }
        
        return res.status(500).json({ 
            error: 'AI servis konfigürasyon hatası. Lütfen sistem yöneticisine başvurun.',
            details: 'Gemini API key geçersiz veya eksik. Doğru API key almak için: https://makersuite.google.com/app/apikey'
        });
    }

    // 4. Kullanıcı bilgilerini topla
    const userId = req.user.userId;
    let userContext = "";
    
    try {
        // Kullanıcı profil bilgilerini al
        const profileData = await getUserProfileData(userId);
        const medications = await getUserMedications(userId);
        const healthHistory = await getUserRecentHealthHistory(userId, 3);
        const reports = await getUserRecentReportMeta(userId, 3);

        // Kullanıcı bağlamını oluştur
        if (profileData) {
            userContext += `Kullanıcı Profili: ${profileData.full_name || 'Bilinmiyor'}`;
            if (profileData.age) {
                userContext += `, ${profileData.age} yaşında`;
            }
            if (profileData.gender) {
                userContext += `, Cinsiyet: ${profileData.gender}`;
            }
            userContext += "\\n";
        }

        if (medications && medications.length > 0) {
            userContext += `Kullandığı İlaçlar: ${medications.map(med => `${med.name} (${med.dose || 'Doz belirtilmemiş'})`).join(', ')}\\n`;
        }

        if (healthHistory && healthHistory.length > 0) {
            userContext += `Son Sağlık Geçmişi: ${healthHistory.map(h => `${h.visit_type} - ${h.department} (${h.hospital_name})`).join(', ')}\\n`;
        }

        if (reports && reports.length > 0) {
            userContext += `Son Raporları: ${reports.map(r => `${r.type} - ${r.status} (${r.doctor_name})`).join(', ')}\\n`;
        }

        // Debug için konsola yazdır
        console.log('=== USER CONTEXT DEBUG ===');
        console.log('UserID:', userId);
        console.log('Profile Data:', JSON.stringify(profileData, null, 2));
        console.log('Medications:', JSON.stringify(medications, null, 2));
        console.log('Health History:', JSON.stringify(healthHistory, null, 2));
        console.log('Reports:', JSON.stringify(reports, null, 2));
        console.log('Generated Context:', userContext);
        console.log('=== END DEBUG ===');
        
    } catch (error) {
        console.error('Kullanıcı bağlam bilgileri alınırken hata:', error);
        // Hata olsa bile devam et, sadece bağlam bilgisi olmayacak
    }

    let contents = [];

    // 5. Sistem Talimatı ve kullanıcı bağlamını hazırla
    let enhancedSystemInstruction = systemInstruction;
    if (userContext.trim()) {
        enhancedSystemInstruction += `\\n\\n=== KULLANICI BİLGİLERİ ===\\n${userContext}\\nBu bilgileri yanıtlarınızda uygun şekilde dikkate alın ancak mahrem bilgileri gereksiz yere tekrar etmeyin.`;
    }

    if (!conversationHistory || conversationHistory.length === 0) {
        contents.push({ role: "user", parts: [{ text: enhancedSystemInstruction }] });
        contents.push({ role: "model", parts: [{ text: "Anladım. Size bugün nasıl yardımcı olabilirim?" }] });
    }

    // Gelen sohbet geçmişini ekle (eğer varsa ve bir diziyse)
    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
        contents = [...contents, ...conversationHistory];
    }
    
    // Yeni kullanıcı mesajını ekle
    contents.push({ role: "user", parts: [{ text: userMessage }] });

    const payload = {
        contents: contents,
        generationConfig: {
            temperature: 0.65, // Biraz daha az rastgelelik için 0.7'den 0.65'e düşürüldü
            maxOutputTokens: 1024,
            // topP: 0.95, // İsteğe bağlı olarak eklenebilir
            // topK: 40,   // İsteğe bağlı olarak eklenebilir
        },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
        ]
    };

    try {
        // 6. Gemini API'sine İstek Gönderme
        const apiResponse = await fetch(`${GEMINI_API_URL_BASE}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        // 7. API Yanıtını İşleme
        // Yanıtın içeriğini her zaman almaya çalışın, .ok olmasa bile hata detayı içerebilir.
        let responseData;
        try {
            responseData = await apiResponse.json();
        } catch (e) {
            // Eğer yanıt JSON değilse (örn: HTML hata sayfası)
            const textResponse = await apiResponse.text(); // Yanıtı metin olarak almayı dene
            console.error('Gemini API: Yanıt JSON formatında değil. Durum:', apiResponse.status, 'Yanıt:', textResponse);
            return res.status(apiResponse.status || 500).json({ error: `AI servisinden beklenmedik bir yanıt alındı (JSON parse edilemedi). Durum: ${apiResponse.status}` });
        }


        if (!apiResponse.ok) {
            console.error('Gemini API Hatası:', apiResponse.status, JSON.stringify(responseData, null, 2));
            let errorMessage = responseData?.error?.message || `AI servisinden yanıt alınamadı (Hata Kodu: ${apiResponse.status}).`;

            if (responseData?.error?.details) {
                errorMessage += ` Detaylar: ${JSON.stringify(responseData.error.details)}`;
            }
            if (apiResponse.status === 400 && responseData?.error?.message.toLowerCase().includes("user location is not supported")){
                errorMessage = "Üzgünüz, bulunduğunuz bölgeden bu AI servisine erişim kısıtlanmış olabilir.";
            } else if (apiResponse.status === 429) {
                errorMessage = "AI servisi şu an çok yoğun, lütfen biraz sonra tekrar deneyin.";
            } else if (String(apiResponse.status).startsWith('4') && (errorMessage.toLowerCase().includes("api key not valid") || errorMessage.toLowerCase().includes("permission denied") || errorMessage.toLowerCase().includes("api_key_invalid"))) {
                errorMessage = "AI servis anahtarı geçersiz veya yetersiz. Lütfen sistem yöneticisi ile iletişime geçin.";
            } else if (errorMessage.toLowerCase().includes("billing account") || errorMessage.toLowerCase().includes("enable billing")) {
                errorMessage = "AI servisi için faturalandırma hesabı yapılandırılmamış veya etkinleştirilmemiş. Lütfen sistem yöneticisi ile iletişime geçin.";
            }
            return res.status(apiResponse.status).json({ error: errorMessage, details: responseData?.error }); // Sadece error objesini gönder
        }

        // Başarılı yanıt
        if (responseData.candidates && responseData.candidates[0]?.content?.parts[0]?.text) {
            const aiResponseMessage = responseData.candidates[0].content.parts[0].text;
            res.json({ reply: aiResponseMessage });
        } else if (responseData.promptFeedback?.blockReason) {
            // Güvenlik filtreleri nedeniyle engellendi
            console.warn('Gemini API: Yanıt güvenlik nedeniyle engellendi:', responseData.promptFeedback);
            const blockReason = responseData.promptFeedback.blockReason;
            let friendlyMessage = "İsteğiniz işlenemedi çünkü güvenlik politikalarımızı ihlal ediyor olabilir.";
            if (blockReason === "SAFETY") { friendlyMessage = "Üzgünüm, bu konuda yardımcı olamam çünkü yanıtım güvenlik politikalarımızla çelişiyor."; }
            else if (blockReason === "OTHER") { friendlyMessage = "Üzgünüm, isteğiniz beklenmedik bir nedenle işlenemedi."; }
            // Diğer blockReason'lar için de mesajlar eklenebilir.
            res.status(400).json({ error: friendlyMessage, blockReason: blockReason, details: responseData.promptFeedback });
        } else {
            // Yanıt geldi ama beklenen formatta değil
            console.error('Gemini API: Başarılı yanıt ancak beklenmedik format', JSON.stringify(responseData, null, 2));
            res.status(500).json({ error: 'AI servisinden anlaşılamayan bir yanıt formatı alındı.' });
        }

    } catch (error) {
        // Genel ağ hatası veya fetch sırasında oluşan diğer hatalar
        console.error('AI Chat isteği sırasında genel hata (fetch veya JSON parse):', error);
        res.status(500).json({ error: 'AI servisine bağlanırken veya yanıt işlenirken bir sorun oluştu. Lütfen ağ bağlantınızı kontrol edin.' });
    }
});

// Debug endpoint - kullanıcı profil bilgilerini test etmek için
router.get('/debug/profile', protect, async (req, res) => {
    try {
        const userId = req.user.userId;
        const profileData = await getUserProfileData(userId);
        const medications = await getUserMedications(userId);
        const healthHistory = await getUserRecentHealthHistory(userId, 3);
        const reports = await getUserRecentReportMeta(userId, 3);

        // User context'i oluştur (aynı logic)
        let userContext = "";
        
        if (profileData) {
            userContext += `Kullanıcı Profili: ${profileData.full_name || 'Bilinmiyor'}`;
            if (profileData.age) {
                userContext += `, ${profileData.age} yaşında`;
            }
            if (profileData.gender) {
                userContext += `, Cinsiyet: ${profileData.gender}`;
            }
            userContext += "\\n";
        }

        if (medications && medications.length > 0) {
            userContext += `Kullandığı İlaçlar: ${medications.map(med => `${med.name} (${med.dose || 'Doz belirtilmemiş'})`).join(', ')}\\n`;
        }

        if (healthHistory && healthHistory.length > 0) {
            userContext += `Son Sağlık Geçmişi: ${healthHistory.map(h => `${h.visit_type} - ${h.department} (${h.hospital_name})`).join(', ')}\\n`;
        }

        if (reports && reports.length > 0) {
            userContext += `Son Raporları: ${reports.map(r => `${r.type} - ${r.status} (${r.doctor_name})`).join(', ')}\\n`;
        }

        res.json({
            userId: userId,
            profileData: profileData,
            medications: medications,
            healthHistory: healthHistory,
            reports: reports,
            generatedUserContext: userContext,
            calculatedAge: profileData ? calculateAge(profileData.birth_date) : null
        });
    } catch (error) {
        console.error('Profile debug hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;