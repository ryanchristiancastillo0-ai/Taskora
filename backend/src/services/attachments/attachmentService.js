const AppError = require("../../utils/AppError.js");
const FileService = require("../platform/fileService.js");

class AttachmentService {
  constructor(prisma, fileService = new FileService()) {
    this.prisma = prisma;
    this.fileService = fileService;
  }

  async addToTask(userId, taskId, file) {
    await this.assertTaskOwnership(userId, taskId);

    const originalName = (file.originalname || "file").slice(0, 255);

    return this.prisma.taskAttachment.create({
      data: {
        taskId,
        url: this.fileService.buildUrl(file.filename),
        fileName: originalName,
        fileType: file.mimetype,
        fileSize: file.size,
      },
    });
  }

  async remove(userId, id) {
    const attachment = await this.prisma.taskAttachment.findUnique({
      where: { id },
      include: { task: { select: { userId: true } } },
    });

    if (!attachment || attachment.task.userId !== userId) {
      throw new AppError("Attachment not found", 404);
    }

    await this.fileService.deleteByUrl(attachment.url);

    await this.prisma.taskAttachment.delete({ where: { id } });
  }

  async assertTaskOwnership(userId, taskId) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, userId },
      select: { id: true },
    });

    if (!task) {
      throw new AppError("Task not found", 404);
    }
  }
}

module.exports = AttachmentService;