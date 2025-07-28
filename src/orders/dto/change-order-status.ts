import { IsEnum, IsUUID } from "class-validator";
import { OrderStatus } from "generated/prisma";
import { OrderStatusList } from "../enum/order.enum";

export class ChangeOrderStatusDto {
    @IsUUID(4)
    id: string;

    @IsEnum(OrderStatus, {
        message: `Valid status are ${ OrderStatusList }`
    })
    status: OrderStatus
}