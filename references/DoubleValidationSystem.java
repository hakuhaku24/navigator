import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.*;
import java.util.regex.*;

public class DoubleValidationSystem {

    // 填入你申請到的 Google API Key
    private static final String GOOGLE_API_KEY = ""; // 替換成自己的 API Key，或者可從環境變數讀取

    static class Attraction {
        String name;
        double lat;
        double lng;
        int level;
        double rating;
        // 驗證標籤 [cite: 121-126]
        boolean googleVerified = false;
        boolean osmVerified = false;
        String existenceStatus = "not_found";
        double recScore = 0.0;
        String category = "C";

        public Attraction(String name, double lat, double lng, int level, double rating) {
            this.name = name;
            this.lat = lat;
            this.lng = lng;
            this.level = level;
            this.rating = rating;
        }
    }

    public static void main(String[] args) {
        try {
            System.setOut(new java.io.PrintStream(System.out, true, "UTF-8"));
            HttpClient client = HttpClient.newHttpClient();

            // 1. 讀取並解析資料庫 [cite: 68-70]
            String content = new String(Files.readAllBytes(Paths.get("attractions.json")), StandardCharsets.UTF_8);
            List<Attraction> pool = parseAttractions(content);

            System.out.println("=== 啟動 Google & OSM 雙重驗證程序 ===");

            for (Attraction poi : pool) {
                System.out.println("\n正在驗證：" + poi.name);

                // 2. 第一重驗證：Google Places API [cite: 105, 106]
                poi.googleVerified = verifyWithGoogle(client, poi);

                // 3. 第二重驗證：OpenStreetMap API [cite: 7, 106]
                poi.osmVerified = verifyWithOSM(client, poi);

                // 4. 判定存在狀態 [cite: 107-110]
                if (poi.googleVerified && poi.osmVerified) {
                    poi.existenceStatus = "active (雙重驗證通過)";
                } else if (poi.googleVerified || poi.osmVerified) {
                    poi.existenceStatus = "active (單一來源確認)";
                } else {
                    poi.existenceStatus = "possibly_closed";
                }

                // 5. 品質評分與分級 [cite: 143, 156-157]
                calculateFinalStatus(poi);

                System.out.printf("> 狀態: %s | 推薦分: %.2f | 等級: %s\n",
                        poi.existenceStatus, poi.recScore, poi.category);
            }

        } catch (Exception e) {
            System.out.println("發生錯誤: " + e.getMessage());
        }
    }

    // Google 驗證邏輯 [cite: 106]
    // 1. 修改後的 Google 驗證函式
    private static boolean verifyWithGoogle(HttpClient client, Attraction poi) throws Exception {
        // 在 fields 增加 "name"，要求 Google 回傳它找到的景點名稱
        String url = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
                + "?input=" + URLEncoder.encode(poi.name, "UTF-8")
                + "&inputtype=textquery&fields=business_status,rating,name&key=" + GOOGLE_API_KEY;

        HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).GET().build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        String body = response.body();

        // 邏輯判斷：必須同時滿足「正在營業」且「名稱匹配」 [cite: 40, 108]
        if (body.contains("OPERATIONAL")) {
            // 從回傳內容中抓取 Google 找到的實際名稱
            String googleReturnedName = extractValue(body, "\"name\" : \"(.*?)\"");

            // 進行名稱相似度比對
            if (isSimilar(poi.name, googleReturnedName)) {
                return true;
            } else {
                // System.out.println(" [警告] Google 匹配到了不相關的景點：" + googleReturnedName);
            }
        }
        return false;
    }

    // 2. 新增的名稱相似度判斷工具 (簡單版)
    private static boolean isSimilar(String myName, String googleName) {
        if (googleName == null)
            return false;
        // 移除括號與特殊字元後比對，防止「(測試用)」這種字眼干擾
        String cleanMyName = myName.replaceAll("\\(.*?\\)", "").trim();
        // 只要 Google 回傳的名稱包含我們資料庫景點的核心關鍵字，就視為通過
        return googleName.contains(cleanMyName) || cleanMyName.contains(googleName);
    }

    // 3. 用來從 JSON 字串中提取特定數值的輔助函式
    private static String extractValue(String json, String regex) {
        Pattern p = Pattern.compile(regex);
        Matcher m = p.matcher(json);
        if (m.find())
            return m.group(1);
        return null;
    }

    // OSM 驗證邏輯 [cite: 106]
    private static boolean verifyWithOSM(HttpClient client, Attraction poi) throws Exception {
        // 改用 nwr (Node, Way, Relation)，並擴大搜尋範圍與名稱匹配靈活性 [cite: 98, 106]
        // [name~"name"] 是正則表達式，只要包含該名稱就算匹配
        String query = "[out:json];" +
                "nwr(around:800," + poi.lat + "," + poi.lng + ")[\"name\"~\"" + poi.name + "\"];" +
                "out center;";

        String url = "https://overpass-api.de/api/interpreter?data=" + URLEncoder.encode(query, "UTF-8");

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("User-Agent", "JavaTravelValidator/1.0") // 加入 User-Agent 避免被 API 拒絕
                .GET()
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        // System.out.println("OSM 原始回傳內容：" + response.body());

        // 如果回傳的 JSON 包含 elements 且不為空，代表驗證成功 [cite: 107-110]
        return response.body().contains("\"type\":");
    }

    // 計算分數與分級 [cite: 143, 158-171]
    private static void calculateFinalStatus(Attraction poi) {
        double w1 = 0.5, w2 = 0.4, w3 = 0.1; // 加入「雙源驗證成功」的小額加分

        double ratingPart = poi.rating / 5.0;
        double authPart = (3.0 - poi.level) / 3.0;
        double verifyBonus = (poi.googleVerified && poi.osmVerified) ? 1.0 : 0.0;

        poi.recScore = (ratingPart * w1) + (authPart * w2) + (verifyBonus * w3);

        if (poi.existenceStatus.contains("active") && poi.recScore >= 0.8) {
            poi.category = "A";
        } else if (poi.existenceStatus.contains("active") && poi.recScore >= 0.6) {
            poi.category = "B";
        } else {
            poi.category = "C";
        }
    }

    // 簡易解析器
    private static List<Attraction> parseAttractions(String json) {
        List<Attraction> list = new ArrayList<>();
        Pattern p = Pattern.compile(
                "\"名稱\": \"(.*?)\",.*?\"分級\": (\\d),.*?\"rating\": (\\d\\.?\\d?),.*?\"lat\": (\\d+\\.\\d+), \"lng\": (\\d+\\.\\d+)",
                Pattern.DOTALL);
        Matcher m = p.matcher(json);
        while (m.find()) {
            list.add(new Attraction(m.group(1), Double.parseDouble(m.group(4)), Double.parseDouble(m.group(5)),
                    Integer.parseInt(m.group(2)), Double.parseDouble(m.group(3))));
        }
        return list;
    }
}