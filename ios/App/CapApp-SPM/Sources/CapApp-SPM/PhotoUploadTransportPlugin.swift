import Foundation
import Capacitor

private struct NativePhotoUpload: Codable {
    var operationId: String
    var ownerId: String
    var catchId: String
    var photoId: String
    var contentType: String
    var size: Int
    var sha256: String
    var filePath: String
    var state: String
    var taskIdentifier: Int?
    var httpStatus: Int?
    var errorCode: String?
    var updatedAt: Date
}

private final class PhotoUploadSession: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate {
    static let shared = PhotoUploadSession()
    static let identifier = "cz.chytnu.photo.upload.v1"
    private let lock = NSRecursiveLock()
    private var session: URLSession!
    private var records: [String: NativePhotoUpload] = [:]
    private var responseData: [Int: Data] = [:]
    private var eventHandler: (([String: Any]) -> Void)?
    private var backgroundCompletionHandler: (() -> Void)?

    private var queueURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ChytnuPhotoUploads", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base.appendingPathComponent("queue.json")
    }

    private override init() {
        super.init()
        loadQueue()
        let configuration = URLSessionConfiguration.background(withIdentifier: Self.identifier)
        configuration.sessionSendsLaunchEvents = true
        configuration.isDiscretionary = false
        configuration.httpMaximumConnectionsPerHost = 2
        configuration.waitsForConnectivity = true
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }

    func setEventHandler(_ handler: @escaping ([String: Any]) -> Void) {
        lock.lock(); defer { lock.unlock() }
        eventHandler = handler
    }

    func receiveBackgroundEvents(_ handler: @escaping () -> Void) {
        lock.lock(); defer { lock.unlock() }
        backgroundCompletionHandler = handler
        _ = session
    }

    func enqueue(operationId: String, ownerId: String, catchId: String, photoId: String,
                 filePath: String, contentType: String, size: Int, sha256: String,
                 uploadURL: String, fields: [String: String]) throws -> [String: Any] {
        guard validId(operationId), validId(ownerId), validId(catchId), validId(photoId),
              let url = URL(string: uploadURL), url.scheme == "https", url.host == "api.cloudinary.com" else {
            throw NSError(domain: "PhotoUploadTransport", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid upload identity or endpoint."])
        }
        let source = filePath.hasPrefix("file:") ? URL(string: filePath)! : URL(fileURLWithPath: filePath)
        let expectedPublicId = "chytnucz/users/\(ownerId)/catches/\(catchId)/photos/\(photoId)/original"
        guard FileManager.default.fileExists(atPath: source.path), ["image/jpeg", "image/png", "image/webp"].contains(contentType),
              size > 0, (try? source.resourceValues(forKeys: [.fileSizeKey]).fileSize) == size,
              sha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              fields["public_id"] == expectedPublicId, fields["type"] == "authenticated", fields["overwrite"] == "true",
              fields["context"] == "sha256=\(sha256)", fields["timestamp"]?.range(of: "^[0-9]{1,12}$", options: .regularExpression) != nil,
              fields["api_key"]?.range(of: "^[0-9]{5,32}$", options: .regularExpression) != nil,
              fields["signature"]?.range(of: "^[a-fA-F0-9]{40,64}$", options: .regularExpression) != nil,
              Set(fields.keys).isSubset(of: ["public_id", "type", "overwrite", "context", "api_key", "timestamp", "signature"]) else {
            throw NSError(domain: "PhotoUploadTransport", code: 400, userInfo: [NSLocalizedDescriptionKey: "Upload file or signed fields are invalid."])
        }
        lock.lock(); defer { lock.unlock() }
        if let existing = records[operationId], ["uploading", "completed"].contains(existing.state) {
            return serialize(existing)
        }
        let boundary = UUID().uuidString
        let bodyURL = queueURL.deletingLastPathComponent().appendingPathComponent("\(operationId).multipart")
        try writeMultipart(to: bodyURL, source: source, contentType: contentType, fields: fields, boundary: boundary)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        var record = NativePhotoUpload(operationId: operationId, ownerId: ownerId, catchId: catchId, photoId: photoId, contentType: contentType,
            size: size, sha256: sha256,
            filePath: source.path, state: "queued", taskIdentifier: nil, httpStatus: nil, errorCode: nil, updatedAt: Date())
        records[operationId] = record
        try saveQueue()
        let task = session.uploadTask(with: request, fromFile: bodyURL)
        task.taskDescription = operationId
        record.state = "uploading"
        record.taskIdentifier = task.taskIdentifier
        record.updatedAt = Date()
        records[operationId] = record
        try saveQueue()
        task.resume()
        return serialize(record)
    }

    func cancel(operationId: String) async {
        let tasks = await allTasks()
        tasks.filter { $0.taskDescription == operationId }.forEach { $0.cancel() }
        lock.lock(); defer { lock.unlock() }
        if let record = records.removeValue(forKey: operationId) {
            removeFiles(for: record)
            try? saveQueue()
            DispatchQueue.main.async { self.eventHandler?(["operationId": operationId, "state": "cancelled"]) }
        }
    }

    func cancel(ownerId: String) async {
        let ids = list().compactMap { ($0["ownerId"] as? String) == ownerId ? $0["operationId"] as? String : nil }
        for id in ids { await cancel(operationId: id) }
    }

    func acknowledge(operationId: String) {
        lock.lock(); defer { lock.unlock() }
        if let record = records.removeValue(forKey: operationId) {
            removeFiles(for: record)
            try? saveQueue()
        }
    }

    func status(operationId: String) async -> [String: Any] {
        let tasks = await allTasks()
        lock.lock(); defer { lock.unlock() }
        guard var record = records[operationId] else { return ["operationId": operationId, "state": "missing"] }
        if let task = tasks.first(where: { $0.taskDescription == operationId }) {
            record.state = task.state == .suspended ? "queued" : "uploading"
            record.taskIdentifier = task.taskIdentifier
            records[operationId] = record
            try? saveQueue()
        } else if record.state == "uploading" || record.state == "queued" {
            record.state = "interrupted"
            record.taskIdentifier = nil
            record.updatedAt = Date()
            records[operationId] = record
            try? saveQueue()
        }
        return serialize(record)
    }

    func list() -> [[String: Any]] {
        lock.lock(); defer { lock.unlock() }
        return records.values.map(serialize).sorted { ($0["updatedAt"] as? String ?? "") < ($1["updatedAt"] as? String ?? "") }
    }

    func reconcile() async -> [[String: Any]] {
        let tasks = await allTasks()
        let taskIds = Set(tasks.compactMap(\.taskDescription))
        lock.lock(); defer { lock.unlock() }
        for (id, var record) in Array(records) where ["uploading", "queued"].contains(record.state) && !taskIds.contains(id) {
            record.state = "interrupted"
            record.taskIdentifier = nil
            record.updatedAt = Date()
            records[id] = record
        }
        try? saveQueue()
        return records.values.map(serialize)
    }

    private func allTasks() async -> [URLSessionTask] {
        await withCheckedContinuation { continuation in session.getAllTasks { continuation.resume(returning: $0) } }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        lock.lock(); defer { lock.unlock() }
        guard data.count + (responseData[dataTask.taskIdentifier]?.count ?? 0) <= 131_072 else { return }
        responseData[dataTask.taskIdentifier, default: Data()].append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let operationId = task.taskDescription else { return }
        lock.lock(); defer { lock.unlock() }
        guard var record = records[operationId] else { return }
        let status = (task.response as? HTTPURLResponse)?.statusCode
        record.httpStatus = status
        record.updatedAt = Date()
        if let error {
            let code = (error as NSError).code
            record.state = code == NSURLErrorCancelled ? "cancelled" : "failed_retryable"
            record.errorCode = code == NSURLErrorNotConnectedToInternet || code == NSURLErrorNetworkConnectionLost
                ? "network_unavailable" : "background_upload_failed"
        } else if let status, (200..<300).contains(status) {
            record.state = "completed"
            record.errorCode = nil
        } else {
            record.state = "failed_retryable"
            record.errorCode = status == 429 ? "rate_limited" : "cloudinary_upload_failed"
        }
        records[operationId] = record
        try? saveQueue()
        let payload: [String: Any] = ["operationId": operationId, "state": record.state,
            "httpStatus": status as Any? ?? NSNull(), "errorCode": record.errorCode as Any? ?? NSNull()]
        DispatchQueue.main.async { self.eventHandler?(payload) }
        responseData.removeValue(forKey: task.taskIdentifier)
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        lock.lock(); let completion = backgroundCompletionHandler; backgroundCompletionHandler = nil; lock.unlock()
        DispatchQueue.main.async { completion?() }
    }

    private func validId(_ value: String) -> Bool {
        value.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil
    }

    private func writeMultipart(to destination: URL, source: URL, contentType: String, fields: [String: String], boundary: String) throws {
        FileManager.default.createFile(atPath: destination.path, contents: nil)
        let output = try FileHandle(forWritingTo: destination)
        defer { try? output.close() }
        for key in fields.keys.sorted() {
            guard key.range(of: "^[A-Za-z0-9_]{1,64}$", options: .regularExpression) != nil else { continue }
            output.write(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(key)\"\r\n\r\n\(fields[key] ?? "")\r\n".utf8))
        }
        let name = source.lastPathComponent.replacingOccurrences(of: "\"", with: "")
        output.write(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(name)\"\r\nContent-Type: \(contentType)\r\n\r\n".utf8))
        let input = try FileHandle(forReadingFrom: source)
        defer { try? input.close() }
        while let data = try input.read(upToCount: 64 * 1024), !data.isEmpty { output.write(data) }
        output.write(Data("\r\n--\(boundary)--\r\n".utf8))
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: destination.path)
    }

    private func loadQueue() {
        guard let data = try? Data(contentsOf: queueURL),
              let loaded = try? JSONDecoder().decode([String: NativePhotoUpload].self, from: data) else { return }
        records = loaded
    }

    private func saveQueue() throws {
        let data = try JSONEncoder().encode(records)
        try data.write(to: queueURL, options: .atomic)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: queueURL.path)
    }

    private func serialize(_ record: NativePhotoUpload) -> [String: Any] {
        ["operationId": record.operationId, "ownerId": record.ownerId, "catchId": record.catchId,
         "photoId": record.photoId, "state": record.state, "httpStatus": record.httpStatus as Any? ?? NSNull(),
         "contentType": record.contentType, "size": record.size, "sha256": record.sha256,
         "errorCode": record.errorCode as Any? ?? NSNull(), "updatedAt": ISO8601DateFormatter().string(from: record.updatedAt)]
    }

    private func removeFiles(for record: NativePhotoUpload) {
        let source = URL(fileURLWithPath: record.filePath)
        try? FileManager.default.removeItem(at: source)
        try? FileManager.default.removeItem(at: queueURL.deletingLastPathComponent().appendingPathComponent("\(record.operationId).multipart"))
    }
}

@objc(PhotoUploadTransportPlugin)
public class PhotoUploadTransportPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotoUploadTransportPlugin"
    public let jsName = "PhotoUploadTransport"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enqueueUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getUploadStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listPendingUploads", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reconcileUploads", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledgeUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelUploadsForOwner", returnType: CAPPluginReturnPromise)
    ]

    private let coordinator = PhotoUploadSession.shared

    override public func load() {
        coordinator.setEventHandler { [weak self] event in self?.notifyListeners("uploadState", data: event) }
    }

    @objc public static func handleBackgroundEvents(_ completionHandler: @escaping () -> Void) {
        PhotoUploadSession.shared.receiveBackgroundEvents(completionHandler)
    }

    @objc func enqueueUpload(_ call: CAPPluginCall) {
        do {
            guard let operationId = call.getString("operationId"), let ownerId = call.getString("ownerId"),
                  let catchId = call.getString("catchId"), let photoId = call.getString("photoId"),
                  let filePath = call.getString("filePath"), let contentType = call.getString("contentType"),
                  let size = call.getInt("size"), let sha256 = call.getString("sha256"), let uploadURL = call.getString("uploadURL"),
                  let fields = call.getObject("fields") as? [String: String] else { throw NSError(domain: "PhotoUploadTransport", code: 400) }
            call.resolve(try coordinator.enqueue(operationId: operationId, ownerId: ownerId, catchId: catchId,
                photoId: photoId, filePath: filePath, contentType: contentType, size: size, sha256: sha256,
                uploadURL: uploadURL, fields: fields))
        } catch { call.reject("Native upload could not be queued.", "native_queue_failed", error) }
    }

    @objc func cancelUpload(_ call: CAPPluginCall) {
        guard let id = call.getString("operationId") else { call.reject("Missing operationId."); return }
        Task { await coordinator.cancel(operationId: id); call.resolve() }
    }

    @objc func getUploadStatus(_ call: CAPPluginCall) {
        guard let id = call.getString("operationId") else { call.reject("Missing operationId."); return }
        Task { call.resolve(await coordinator.status(operationId: id)) }
    }

    @objc func listPendingUploads(_ call: CAPPluginCall) { call.resolve(["uploads": coordinator.list()]) }
    @objc func reconcileUploads(_ call: CAPPluginCall) { Task { call.resolve(["uploads": await coordinator.reconcile()]) } }

    @objc func acknowledgeUpload(_ call: CAPPluginCall) {
        guard let id = call.getString("operationId") else { call.reject("Missing operationId."); return }
        coordinator.acknowledge(operationId: id); call.resolve()
    }

    @objc func cancelUploadsForOwner(_ call: CAPPluginCall) {
        guard let ownerId = call.getString("ownerId") else { call.reject("Missing ownerId."); return }
        Task { await coordinator.cancel(ownerId: ownerId); call.resolve() }
    }
}
